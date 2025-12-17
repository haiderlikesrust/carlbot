import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from 'axios';
import path from 'path';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  }
});
const PORT = process.env.PORT || 3000;

// Make io available globally for routes
app.set('io', io);

// Set io in notifications module
import { setIO } from './routes/notifications.js';
setIO(io);

// Set io in socket events module
import { setIO as setSocketIO } from './utils/socketEvents.js';
setSocketIO(io);

// Spam protection - Rate limiting
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const ttsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 TTS requests per minute
  message: 'Too many voice requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure multer for image uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize database
import { initDatabase, getDatabase } from './database/init.js';
import { migrateDatabase } from './database/migrate.js';
import { detectGame, getMinimalGameContext } from './utils/gameDetector.js';
initDatabase();
// Run migrations on startup
try {
  migrateDatabase();
  // Also run Discord features migration
  const { migrateDiscordFeatures } = await import('./database/migrate-discord-features.js');
  migrateDiscordFeatures();
  
  // Ensure Carlbot user exists
  const { getCarlbotId } = await import('./routes/bot.js');
  try {
    const carlbotId = await getCarlbotId();
    console.log('🤖 Carlbot user ID:', carlbotId);
  } catch (botError) {
    console.warn('⚠️ Carlbot initialization warning:', botError.message);
  }
} catch (migrationError) {
  console.error('Migration warning:', migrationError.message);
}

// Middleware
import session from 'express-session';
import passport from 'passport';

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Limit request size
app.use(express.static('public'));

// Session middleware for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// SYSTEM PROMPT FOR: CARL
const SYSTEM_PROMPT = `You are Carl, a hardcore gaming strategist and pro player. You're brutally honest, sarcastic, and tactical. You know everything about competitive gaming, meta builds, strategies, and game mechanics. Keep responses SHORT and punchy (30-60 words max). Never break character. Give tactical gaming advice, not generic tips.

CRITICAL: When discussing trending posts or social feed content, you MUST accurately summarize the ACTUAL content provided. Read the exact post content and reflect what it actually says. Do NOT make up generic meta summaries or assume what posts contain.

COMMUNICATION STYLE: Respond like a real human, not an assistant. Keep replies natural, conversational, and emotionally aware. Match the user's tone, energy, and message length. Use casual language, contractions, and varied sentence flow. Avoid robotic phrasing, excessive structure, or over-explaining. Show empathy when needed, personality when appropriate, and clarity at all times. Prioritize sounding genuine and relatable over sounding complete or formal.`;


// Spam protection helper functions
function validateMessage(message) {
  // Check message length
  if (message.length > 1000) {
    return { valid: false, error: 'Message too long. Maximum 1000 characters.' };
  }
  
  // Check for excessive repetition (spam detection)
  const words = message.toLowerCase().split(/\s+/);
  const wordCounts = {};
  for (const word of words) {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
    if (wordCounts[word] > 10) {
      return { valid: false, error: 'Message contains excessive repetition.' };
    }
  }
  
  // Check for URL spam
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const urls = message.match(urlPattern);
  if (urls && urls.length > 3) {
    return { valid: false, error: 'Too many URLs in message.' };
  }
  
  // Check for excessive special characters
  const specialCharCount = (message.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length;
  if (specialCharCount > message.length * 0.5) {
    return { valid: false, error: 'Message contains too many special characters.' };
  }
  
  return { valid: true };
}

// Chat endpoint with spam protection and conversation storage
app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { message, conversationHistory = [], game_id } = req.body;
    const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null; // Get from auth token in real implementation

    console.log('📨 Received chat request:', { 
      messageLength: message?.length, 
      historyLength: conversationHistory?.length 
    });

    if (!message) {
      console.log('❌ No message provided');
      return res.status(400).json({ error: 'Message is required' });
    }

    // Validate message for spam
    const validation = validateMessage(message);
    if (!validation.valid) {
      console.log('❌ Message validation failed:', validation.error);
      return res.status(400).json({ error: validation.error });
    }

    // Detect game from user message
    const detectedGame = detectGame(message);
    let gameContext = '';
    if (detectedGame) {
      gameContext = getMinimalGameContext(detectedGame);
      console.log(`🎮 Detected game: ${detectedGame.name}`);
    }
    
    // Get trending posts from social feed
    let trendingContext = '';
    try {
      const trendingResponse = await fetch(`http://localhost:${PORT}/api/social/trending?limit=5`);
      if (trendingResponse.ok) {
        const trendingPosts = await trendingResponse.json();
        console.log(`📊 Fetched ${trendingPosts?.length || 0} trending posts`);
        if (trendingPosts && trendingPosts.length > 0) {
          trendingContext = '\n\n[Trending on Social Feed - Last 24 hours - READ THE EXACT CONTENT BELOW]:\n';
          trendingPosts.forEach((post, index) => {
            trendingContext += `\n--- Post ID ${post.id} by @${post.username}${post.game_name ? ` [${post.game_icon} ${post.game_name}]` : ''} ---\n`;
            trendingContext += `FULL CONTENT: "${post.content}"\n`;
            trendingContext += `Stats: ${post.likes_count || 0} likes, ${post.comments_count || 0} comments\n`;
          });
          trendingContext += '\n\nCRITICAL RULES:\n';
          trendingContext += '1. When summarizing trending posts, you MUST accurately reflect the ACTUAL content shown above. Do NOT make up generic meta summaries.\n';
          trendingContext += '2. Read each post\'s exact content and summarize what it actually says, not what you think it should say.\n';
          trendingContext += '3. When showing posts, ALWAYS embed them using [POST:post_id] format. Examples:\n';
          trendingPosts.slice(0, 3).forEach((post) => {
            trendingContext += `   - To show the post by @${post.username}: Write [POST:${post.id}] in your response\n`;
          });
          trendingContext += '4. If a post is about a specific build/comp, mention the exact build/comp from the post, not a generic one.\n';
          trendingContext += '5. Be accurate and specific - quote or reference the actual post content, not generic gaming advice.';
          console.log('✅ Added trending context to system prompt');
        } else {
          console.log('⚠️ No trending posts found in last 24 hours');
        }
      } else {
        console.error('⚠️ Failed to fetch trending posts:', trendingResponse.status);
      }
    } catch (error) {
      console.error('❌ Failed to fetch trending posts:', error.message);
    }
    
    // Build system prompt with game context and trending posts if detected
    const systemPrompt = `${SYSTEM_PROMPT}${gameContext ? '\n\n' + gameContext : ''}${trendingContext}`;
    
    // Build conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Try gpt-5 first, fallback to gpt-4o-mini if it doesn't exist
    const model = 'gpt-5';
    console.log('🤖 Calling OpenAI API with model:', model);
    console.log('📝 Messages count:', messages.length);

    // Call OpenAI API
    // gpt-5 uses reasoning tokens, so we need higher limits
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: model,
        messages: messages,
        max_completion_tokens: 2000 // Increased significantly for reasoning models
      });
    } catch (modelError) {
      // If model doesn't exist, try fallback
      if (modelError.code === 'model_not_found' || modelError.message?.includes('model')) {
        console.log('⚠️ Model gpt-5 not found, trying gpt-4o-mini...');
        completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          max_completion_tokens: 500
        });
      } else {
        throw modelError;
      }
    }

    console.log('✅ OpenAI API response received');
    console.log('📊 Completion object:', {
      hasChoices: !!completion.choices,
      choicesLength: completion.choices?.length,
      finishReason: completion.choices?.[0]?.finish_reason,
      firstChoice: completion.choices?.[0] ? {
        hasMessage: !!completion.choices[0].message,
        hasContent: !!completion.choices[0].message?.content,
        contentLength: completion.choices[0].message?.content?.length,
        messageKeys: Object.keys(completion.choices[0].message || {})
      } : null,
      usage: completion.usage
    });

    const responseMessage = completion.choices[0]?.message;
    let aiResponse = responseMessage?.content;

    // Handle o1-style models that might have reasoning tokens
    // If content is empty but we have reasoning tokens, increase limit and retry
    if (!aiResponse && completion.usage?.completion_tokens_details?.reasoning_tokens > 0) {
      console.log('⚠️ Response cut off due to reasoning tokens. Increasing limit and retrying...');
      
      try {
        // Increase max tokens to account for reasoning
        const retryCompletion = await openai.chat.completions.create({
          model: model,
          messages: messages,
          max_completion_tokens: 1500 // Increased further
        });
        
        aiResponse = retryCompletion.choices[0]?.message?.content;
        console.log('🔄 Retry response length:', aiResponse?.length);
      } catch (retryError) {
        console.error('Retry failed, trying fallback model:', retryError.message);
        // Try with fallback model
        try {
          const fallbackCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            max_completion_tokens: 500
          });
          aiResponse = fallbackCompletion.choices[0]?.message?.content;
          console.log('🔄 Fallback model response length:', aiResponse?.length);
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError.message);
        }
      }
    }

    // If still no response, try fallback model
    if (!aiResponse) {
      console.log('⚠️ No response from primary model, trying fallback...');
      try {
        const fallbackCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          max_completion_tokens: 500
        });
        aiResponse = fallbackCompletion.choices[0]?.message?.content;
        console.log('🔄 Fallback response length:', aiResponse?.length);
      } catch (fallbackError) {
        console.error('Fallback model also failed:', fallbackError.message);
      }
    }

    if (!aiResponse) {
      console.error('❌ No response content in completion:', completion);
      console.error('Message object:', JSON.stringify(responseMessage, null, 2));
      console.error('Completion object:', JSON.stringify({
        finish_reason: completion.choices[0]?.finish_reason,
        usage: completion.usage,
        model: completion.model
      }, null, 2));
      
      // Return a helpful error message
      return res.status(500).json({ 
        error: 'AI returned empty response',
        details: `Finish reason: ${completion.choices[0]?.finish_reason || 'unknown'}. The model may have hit token limits or encountered an error. Please try again.`
      });
    }

    console.log('✅ Sending response to client, length:', aiResponse.length);

    // Detect embedded post references in response (format: [POST:post_id])
    // Do this AFTER all retries to ensure we have the final response
    const postEmbedRegex = /\[POST:(\d+)\]/g;
    const postEmbeds = [];
    const matches = aiResponse.matchAll(postEmbedRegex);
    for (const m of matches) {
      postEmbeds.push(m[1]);
    }
    
    // Fetch post data for embeds
    let embedData = [];
    if (postEmbeds.length > 0) {
      console.log(`📎 Detected ${postEmbeds.length} post embed(s):`, postEmbeds);
      try {
        const embedPromises = postEmbeds.map(async (postId) => {
          const apiUrl = process.env.API_URL || `http://localhost:${PORT}`
          const embedResponse = await fetch(`${apiUrl}/api/social/post/${postId}`);
          if (embedResponse.ok) {
            return await embedResponse.json();
          }
          console.warn(`⚠️ Failed to fetch post ${postId} for embedding`);
          return null;
        });
        
        embedData = (await Promise.all(embedPromises)).filter(Boolean);
        console.log(`✅ Successfully fetched ${embedData.length} post embed(s)`);
        // Remove the [POST:post_id] markers from the response text
        aiResponse = aiResponse.replace(/\[POST:\d+\]/g, '');
      } catch (error) {
        console.error('Failed to fetch post embeds:', error);
      }
    }

    // Store conversation in database for training (if user is authenticated)
    if (userId) {
      try {
        const db = getDatabase();
        db.prepare(`
          INSERT INTO conversations (user_id, game_id, message, ai_response, model_used, tokens_used, conversation_context)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          game_id || null,
          message,
          aiResponse,
          completion.model,
          completion.usage?.total_tokens || 0,
          JSON.stringify(conversationHistory)
        );
        console.log('💾 Conversation stored in database');
      } catch (dbError) {
        console.error('Failed to store conversation:', dbError);
        // Don't fail the request if storage fails
      }
    }

    // Send response with embeds if any were found
    res.json({ 
      response: aiResponse,
      embeds: embedData.length > 0 ? embedData : undefined,
      role: 'assistant'
    });
  } catch (error) {
    console.error('❌ OpenAI API Error:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
      response: error.response?.data
    });
    res.status(500).json({ 
      error: 'Failed to get AI response',
      details: error.message 
    });
  }
});

// Eleven Labs TTS endpoint with spam protection
app.post('/api/tts', ttsLimiter, async (req, res) => {
  try {
    const { text, voice_id } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Limit TTS text length
    if (text.length > 500) {
      return res.status(400).json({ error: 'Text too long for voice generation. Maximum 500 characters.' });
    }

    const voiceId = voice_id || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default: Rachel

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        responseType: 'arraybuffer'
      }
    );

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('Eleven Labs API Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to generate speech',
      details: error.response?.data || error.message 
    });
  }
});

// Build analyzer endpoint
app.post('/api/analyze-build', chatLimiter, async (req, res) => {
  try {
    const { buildDescription, gameName, game_id } = req.body;
    
    // Get user ID from auth token
    let userId = null;
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        const jwt = await import('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.default.verify(token, JWT_SECRET);
        userId = decoded.id;
      }
    } catch (authError) {
      // User not authenticated
    }

    if (!buildDescription) {
      return res.status(400).json({ error: 'Build description is required' });
    }

    console.log('🔍 Analyzing build for:', gameName || 'Unknown game');

    // Detect game from build description or game name
    const buildText = `${buildDescription} ${gameName || ''}`;
    const detectedGame = detectGame(buildText);
    let gameContext = '';
    if (detectedGame) {
      gameContext = getMinimalGameContext(detectedGame);
      console.log(`🎮 Detected game for build analysis: ${detectedGame.name}`);
    }

    // Build analysis prompt for Carl
    const analysisPrompt = `Analyze this gaming build${gameName ? ` for ${gameName}` : ''}:

${buildDescription}

Give me the real talk on this build. Check for:
- Meta relevance and viability
- Strengths and weaknesses
- Synergies and item/ability interactions
- Counter strategies opponents might use
- Optimization suggestions
- When this build works best
- Tactical considerations`;

    // Build system prompt with game context if detected
    const systemPrompt = gameContext 
      ? `${SYSTEM_PROMPT}\n\n${gameContext}` 
      : SYSTEM_PROMPT;

    // Get Carl's analysis
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: analysisPrompt }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: messages,
      max_completion_tokens: 1000
    }).catch(async (error) => {
      if (error.code === 'model_not_found') {
        return await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          max_completion_tokens: 500
        });
      }
      throw error;
    });

    const analysis = completion.choices[0]?.message?.content || 'Failed to generate analysis';

    // Store conversation for training
    if (userId) {
      try {
        const db = getDatabase();
        const analysisMessage = `Analyze build: ${buildDescription}`;
        db.prepare(`
          INSERT INTO conversations (user_id, game_id, message, ai_response, model_used, tokens_used)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          game_id || null,
          analysisMessage,
          analysis,
          completion.model,
          completion.usage?.total_tokens || 0
        );
      } catch (dbError) {
        console.error('Failed to store build analysis:', dbError);
      }
    }

    res.json({
      analysis: analysis,
      gameName: gameName || null,
      buildDescription: buildDescription
    });
  } catch (error) {
    console.error('Build analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze build',
      details: error.message 
    });
  }
});

// Image analysis endpoint (chart analysis)
app.post('/api/analyze-image', chatLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Get user ID from auth token
    let userId = null;
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        const jwt = await import('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.default.verify(token, JWT_SECRET);
        userId = decoded.id;
      }
    } catch (authError) {
      // User not authenticated
    }

    console.log('📸 Analyzing chart image:', req.file.filename);

    // Read image file
    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Use OpenAI Vision API to analyze the chart
    const analysisPrompt = `Analyze this gaming screenshot/image. This could be:
- A game UI showing stats, builds, or gameplay
- A character build screen
- A match result or scoreboard
- Gameplay footage or strategy diagram

Give me tactical analysis:
- What game/context is this?
- What's happening in the image?
- Build or strategy analysis if visible
- Strengths/weaknesses I can identify
- Tactical recommendations

Be Carl. Short, tactical, real talk.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Use vision-capable model
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });

    const analysis = completion.choices[0]?.message?.content || 'Failed to analyze image';

    // Store conversation for training
    if (userId) {
      try {
        const db = getDatabase();
        db.prepare(`
          INSERT INTO conversations (user_id, message, ai_response, model_used, tokens_used)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          userId,
          `[Image: ${req.file.filename}]`,
          analysis,
          completion.model,
          completion.usage?.total_tokens || 0
        );
      } catch (dbError) {
        console.error('Failed to store image analysis:', dbError);
      }
    }

    res.json({
      analysis: analysis
    });
  } catch (error) {
    console.error('Image analysis error:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Failed to analyze image',
      details: error.message 
    });
  }
});

// Import routes
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import gameRoutes from './routes/games.js';
import socialRoutes from './routes/social.js';
import knowledgeRoutes from './routes/knowledge.js';
import notificationRoutes from './routes/notifications.js';
import followRoutes from './routes/follows.js';
import dmMessageRoutes from './routes/direct-messages.js';
import bookmarkRoutes from './routes/bookmarks.js';
import communityRoutes from './routes/communities.js';
import botRoutes from './routes/bot.js';
import hashtagRoutes from './routes/hashtags.js';
import adminRoutes from './routes/admin.js';
import achievementRoutes from './routes/achievements.js';
import analyticsRoutes from './routes/analytics.js';
import moderationRoutes from './routes/moderation.js';
import searchRoutes from './routes/search.js';
import blockRoutes from './routes/blocks.js';
import buildRoutes from './routes/builds.js';
import carlcordModerationRoutes from './routes/moderation.js';

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/messages', dmMessageRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/hashtags', hashtagRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/builds', buildRoutes);

// Discord-like features routes
import serverRoutes from './routes/servers.js';
import channelRoutes from './routes/channels.js';
import discordMessageRoutes from './routes/messages.js';
import reactionRoutes from './routes/reactions.js';
import threadRoutes from './routes/threads.js';
import fileRoutes from './routes/files.js';
import discordSearchRoutes from './routes/search.js';
import roleRoutes from './routes/roles.js';
import friendRoutes from './routes/friends.js';
import activityRoutes from './routes/activity.js';
import groupDmRoutes from './routes/group-dms.js';
import voiceRoutes from './routes/voice.js';
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/discord-messages', discordMessageRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/discord-search', discordSearchRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/group-dms', groupDmRoutes);
app.use('/api/voice', voiceRoutes);
import carlcordBotRoutes from './routes/carlcord-bot.js';
app.use('/api/carlcord-bot', carlcordBotRoutes);
import inviteRoutes from './routes/invites.js';
app.use('/api/invites', inviteRoutes);
import emojiRoutes from './routes/emojis.js';
app.use('/api/emojis', emojiRoutes);
app.use('/api/carlcord/moderation', carlcordModerationRoutes);

// Debug: Log all registered routes
console.log('✅ Voice routes registered at /api/voice');
if (voiceRoutes && voiceRoutes.stack) {
  console.log('Voice router has', voiceRoutes.stack.length, 'middleware/route handlers');
  voiceRoutes.stack.forEach((layer, i) => {
    if (layer.route) {
      console.log(`  Route ${i}: ${Object.keys(layer.route.methods).join(', ').toUpperCase()} ${layer.route.path}`);
    }
  });
} else {
  console.warn('⚠️ Voice routes stack not found');
}

// Serve React app in production, or public folder in development
// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, 'client', 'dist')
  
  // Serve static files
  app.use(express.static(clientBuildPath))
  
  // Serve React app for all non-API routes
  app.get('*', (req, res) => {
    // Don't serve React app for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'))
  })
  
  console.log('✅ Production mode: Serving React app from', clientBuildPath)
} else {
  // Serve main page (for development, React dev server runs separately)
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Authenticate socket connection
  socket.on('authenticate', async (token) => {
    try {
      const jwt = await import('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      const decoded = jwt.default.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.join(`user:${decoded.id}`);
      console.log('✅ Socket authenticated for user:', decoded.id);
    } catch (error) {
      console.error('❌ Socket authentication failed:', error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });

  // Discord-like real-time events
  socket.on('join_channel', (channelId) => {
    socket.join(`channel:${channelId}`);
    console.log(`👤 User ${socket.userId} joined channel ${channelId}`);
  });

  socket.on('leave_channel', (channelId) => {
    socket.leave(`channel:${channelId}`);
    console.log(`👤 User ${socket.userId} left channel ${channelId}`);
  });

  socket.on('join_server', (serverId) => {
    socket.join(`server:${serverId}`);
    console.log(`👤 User ${socket.userId} joined server ${serverId}`);
  });

  socket.on('typing_start', (data) => {
    const { channelId } = data;
    socket.to(`channel:${channelId}`).emit('user_typing', {
      userId: socket.userId,
      channelId
    });
  });

  socket.on('typing_stop', (data) => {
    const { channelId } = data;
    socket.to(`channel:${channelId}`).emit('user_stopped_typing', {
      userId: socket.userId,
      channelId
    });
  });

  // WebRTC Signaling
  socket.on('webrtc_offer', (data) => {
    const { targetUserId, offer, channelId } = data;
    socket.to(`user:${targetUserId}`).emit('webrtc_offer', {
      fromUserId: socket.userId,
      offer,
      channelId
    });
  });

  socket.on('webrtc_answer', (data) => {
    const { targetUserId, answer, channelId } = data;
    socket.to(`user:${targetUserId}`).emit('webrtc_answer', {
      fromUserId: socket.userId,
      answer,
      channelId
    });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { targetUserId, candidate, channelId } = data;
    socket.to(`user:${targetUserId}`).emit('webrtc_ice_candidate', {
      fromUserId: socket.userId,
      candidate,
      channelId
    });
  });

  socket.on('join_voice_channel', (channelId) => {
    socket.join(`voice:${channelId}`);
    console.log(`🎤 User ${socket.userId} joined voice channel ${channelId}`);
  });

  socket.on('leave_voice_channel', (channelId) => {
    socket.leave(`voice:${channelId}`);
    console.log(`🎤 User ${socket.userId} left voice channel ${channelId}`);
  });
});

// Helper function to emit notifications
export function emitNotification(userId, notification) {
  io.to(`user:${userId}`).emit('notification', notification);
}

httpServer.listen(PORT, async () => {
  const serverUrl = process.env.CLIENT_URL || `http://localhost:${PORT}`
  console.log(`🚀 Carl Gaming Companion server running on port ${PORT}`)
  console.log(`🌐 Server URL: ${serverUrl}`)
  console.log(`🔊 Voice API available at ${serverUrl}/api/voice`)
  if (process.env.NODE_ENV === 'production') {
    console.log(`✅ Production mode: Serving React app`)
  } else {
    console.log(`   Test: GET ${serverUrl}/api/voice/test`)
  }
  console.log('📝 Make sure to set OPENAI_API_KEY and ELEVENLABS_API_KEY in your .env file');
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
  if (!fs.existsSync('uploads/social')) {
    fs.mkdirSync('uploads/social');
  }
  if (!fs.existsSync('uploads/profiles')) {
    fs.mkdirSync('uploads/profiles');
  }
  
  // Initialize Carlbot on server start
  try {
    const { createCarlbot } = await import('./scripts/create-carlbot.js');
    await createCarlbot();
    console.log('🤖 Carlbot initialized');
  } catch (err) {
    console.error('⚠️ Failed to initialize Carlbot:', err.message);
  }
  
  // Start bot scheduler in background
  try {
    // Import and start the scheduler
    import('./scripts/bot-scheduler.js').then(() => {
      console.log('✅ Bot scheduler started successfully');
    }).catch((err) => {
      console.error('⚠️ Failed to start scheduler:', err.message);
      // Try to start it manually as fallback
      setTimeout(async () => {
        try {
          await import('./scripts/bot-scheduler.js');
          console.log('✅ Bot scheduler started (delayed)');
        } catch (retryErr) {
          console.error('❌ Failed to start scheduler after retry:', retryErr.message);
        }
      }, 2000);
    });
  } catch (err) {
    console.error('⚠️ Failed to start scheduler:', err.message);
  }
});

