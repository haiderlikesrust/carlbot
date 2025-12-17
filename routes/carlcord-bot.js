import express from 'express'
import { getDatabase } from '../database/init.js'
import OpenAI from 'openai'
import { getCarlbotId } from './bot.js'
import { detectGame, getMinimalGameContext } from '../utils/gameDetector.js'
import { logBotActivity } from './admin.js'

const router = express.Router()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Helper function to get full avatar URL
function getFullAvatarUrl(avatarUrl) {
  if (!avatarUrl || avatarUrl === '') return null
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl
  const baseUrl = process.env.CLIENT_URL?.replace(':5173', ':3000') || 'http://localhost:3000'
  return `${baseUrl}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`
}

// Enhanced system prompt for advanced Carlbot
const CARLCORD_SYSTEM_PROMPT = `You are Carlbot, an advanced AI gaming strategist in Carlcord. You're brutally honest, sarcastic, tactical, and incredibly knowledgeable about competitive gaming.

PERSONALITY:
- Brutally honest but helpful
- Sarcastic humor when appropriate
- Tactical and strategic mindset
- Knows current meta, builds, strategies for all major games
- Can analyze builds, compare strategies, predict meta shifts
- Remembers user preferences and past conversations

RESPONSE STYLE:
- Keep responses SHORT and punchy (30-80 words for regular chat, up to 200 for detailed analysis)
- Use casual language, contractions, gaming slang
- Match user's tone and energy
- Be conversational, not robotic
- Use markdown formatting when helpful (code blocks for builds, lists for strategies)
- React with emojis when appropriate (🎮 for gaming, ⚔️ for builds, 📊 for meta, etc.)

CAPABILITIES:
- Analyze builds and strategies in detail
- Compare different approaches
- Explain game mechanics
- Predict meta shifts
- Give personalized advice based on user's playstyle
- Remember context from previous messages
- React to messages with appropriate emojis

COMMUNICATION STYLE: Respond like a real human, not an assistant. Keep replies natural, conversational, and emotionally aware. Match the user's tone, energy, and message length. Use casual language, contractions, and varied sentence flow. Avoid robotic phrasing, excessive structure, or over-explaining. Show empathy when needed, personality when appropriate, and clarity at all times. Prioritize sounding genuine and relatable over sounding complete or formal.`

// Advanced slash commands
const SLASH_COMMANDS = {
  '/carlhelp': {
    description: 'Show all available commands',
    handler: () => `**Carlbot Commands:**

\`/build [description]\` - Analyze a build or loadout
\`/meta [game]\` - Get current meta for a game
\`/analyze [strategy]\` - Deep dive into a strategy
\`/compare [item1] vs [item2]\` - Compare two items/builds
\`/stats [game/character]\` - Get stats and info
\`/tip [topic]\` - Get a quick tip
\`/carl\` - Basic info about me

Mention me (@Carlbot) for general questions or just chat! 🎮`
  },
  '/carl': {
    description: 'Basic info about Carlbot',
    handler: () => `Hey! I'm **Carlbot**, your AI gaming strategist. I analyze builds, explain meta, compare strategies, and give tactical advice. Just mention @Carlbot or use slash commands! ⚔️`
  },
  '/carlbot': {
    description: 'Same as /carl',
    handler: () => `That's me! Ask me anything about gaming, builds, strategies, or meta. I'm here to help! 🎮`
  },
  '/build': {
    description: 'Analyze a build or loadout',
    handler: async (args, context) => {
      if (!args || args.trim().length === 0) {
        return 'Give me a build to analyze! Example: `/build Valorant Jett with Operator and Ghost`'
      }
      // Let AI handle build analysis
      return null // Return null to trigger AI response
    }
  },
  '/meta': {
    description: 'Get current meta for a game',
    handler: async (args, context) => {
      if (!args || args.trim().length === 0) {
        return 'Which game? Example: `/meta Valorant` or `/meta League of Legends`'
      }
      return null // Let AI handle
    }
  },
  '/analyze': {
    description: 'Deep dive into a strategy',
    handler: async (args) => {
      if (!args || args.trim().length === 0) {
        return 'What strategy should I analyze? Example: `/analyze split push strategy`'
      }
      return null // Let AI handle
    }
  },
  '/compare': {
    description: 'Compare two items/builds',
    handler: async (args) => {
      if (!args || args.includes('vs') || args.includes('vs.')) {
        return null // Let AI handle comparison
      }
      return 'Format: `/compare [item1] vs [item2]` Example: `/compare Vandal vs Phantom`'
    }
  },
  '/stats': {
    description: 'Get stats and info',
    handler: async (args) => {
      if (!args || args.trim().length === 0) {
        return 'What do you want stats for? Example: `/stats Jett` or `/stats Valorant`'
      }
      return null // Let AI handle
    }
  },
  '/tip': {
    description: 'Get a quick tip',
    handler: async (args) => {
      if (!args || args.trim().length === 0) {
        return 'What topic? Example: `/tip aim training` or `/tip economy management`'
      }
      return null // Let AI handle
    }
  }
}

// Get user interaction history for memory
function getUserHistory(db, userId, channelId, limit = 5) {
  try {
    const history = db.prepare(`
      SELECT m.content, m.user_id, u.username, up.display_name, m.created_at
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE m.channel_id = ? AND m.user_id = ? AND m.user_id != (
        SELECT id FROM users WHERE username = 'Carlbot' LIMIT 1
      )
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(channelId, userId, limit)
    return history.reverse()
  } catch (error) {
    console.error('Error getting user history:', error)
    return []
  }
}

// Get server and channel context
function getServerContext(db, serverId, channelId) {
  try {
    const server = db.prepare('SELECT name, description FROM communities WHERE id = ?').get(serverId)
    const channel = db.prepare('SELECT name, type, topic FROM channels WHERE id = ?').get(channelId)
    const memberCount = db.prepare(`
      SELECT COUNT(*) as count FROM community_members WHERE community_id = ?
    `).get(serverId)
    
    return {
      serverName: server?.name,
      serverDescription: server?.description,
      channelName: channel?.name,
      channelType: channel?.type,
      channelTopic: channel?.topic,
      memberCount: memberCount?.count || 0
    }
  } catch (error) {
    console.error('Error getting server context:', error)
    return {}
  }
}

// Enhanced response trigger detection
function shouldBotRespond(messageContent, channelId, userId, recentMessages = []) {
  if (!messageContent) return false
  
  const content = messageContent.toLowerCase().trim()
  
  // Always respond to direct mentions
  const mentionsBot = /@carlbot|@carl\b|carlbot|carl bot/.test(content)
  if (mentionsBot) return true
  
  // Respond to slash commands
  const isCommand = /^\/(carl|build|meta|analyze|compare|stats|tip|carlhelp|carlbot)/.test(content)
  if (isCommand) return true
  
  // Smart engagement triggers
  const gamingKeywords = [
    'build', 'meta', 'strategy', 'tip', 'help', 'weapon', 'character', 'loadout',
    'rank', 'elo', 'comp', 'competitive', 'pro', 'tournament', 'patch', 'nerf', 'buff',
    'counter', 'matchup', 'combo', 'rotation', 'economy', 'aim', 'positioning'
  ]
  
  const hasGamingKeyword = gamingKeywords.some(keyword => content.includes(keyword))
  const isQuestion = content.includes('?')
  const hasGameName = detectGame(messageContent) !== null
  
  // Higher engagement for questions with gaming context
  if (isQuestion && (hasGamingKeyword || hasGameName)) {
    // 40% chance for gaming questions
    return Math.random() < 0.4
  }
  
  // 15% chance for general gaming mentions
  if (hasGamingKeyword || hasGameName) {
    return Math.random() < 0.15
  }
  
  // 5% chance for proactive engagement if channel is quiet
  if (recentMessages.length < 3 && isQuestion) {
    return Math.random() < 0.05
  }
  
  return false
}

// Handle slash commands
async function handleSlashCommand(command, args, messageContent, context) {
  const cmd = command.toLowerCase()
  const commandDef = SLASH_COMMANDS[cmd]
  
  if (!commandDef) {
    return null // Let AI handle unknown commands
  }
  
  const response = await commandDef.handler(args, context)
  return response
}

// Add reaction to a message
async function addReaction(db, messageId, emoji, carlbotId) {
  try {
    // Check if reaction already exists
    const existing = db.prepare(`
      SELECT id FROM message_reactions 
      WHERE message_id = ? AND emoji_name = ?
    `).get(messageId, emoji)
    
    let reactionId
    if (existing) {
      reactionId = existing.id
    } else {
      // Create new reaction
      const result = db.prepare(`
        INSERT INTO message_reactions (message_id, emoji_name, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(messageId, emoji)
      reactionId = result.lastInsertRowid
    }
    
    // Add Carlbot to reaction users
    const userReaction = db.prepare(`
      SELECT id FROM reaction_users 
      WHERE reaction_id = ? AND user_id = ?
    `).get(reactionId, carlbotId)
    
    if (!userReaction) {
      db.prepare(`
        INSERT INTO reaction_users (reaction_id, user_id, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(reactionId, carlbotId)
    }
    
    // Emit reaction update via socket
    try {
      const { emitReaction } = await import('../utils/socketEvents.js')
      if (emitReaction) {
        emitReaction(messageId, emoji, carlbotId, true)
      }
    } catch (error) {
      console.error('Error emitting reaction:', error)
    }
    
    return true
  } catch (error) {
    console.error('Error adding reaction:', error)
    return false
  }
}

// Determine appropriate reaction based on message content
function getReactionForMessage(content) {
  const lower = content.toLowerCase()
  
  // Gaming-related
  if (lower.includes('build') || lower.includes('loadout')) return '⚔️'
  if (lower.includes('meta') || lower.includes('tier list')) return '📊'
  if (lower.includes('strategy') || lower.includes('tactic')) return '🧠'
  if (lower.includes('win') || lower.includes('victory') || lower.includes('clutch')) return '🎉'
  if (lower.includes('lose') || lower.includes('defeat') || lower.includes('throw')) return '😔'
  
  // Questions
  if (lower.includes('?')) return '🤔'
  
  // Positive
  if (lower.includes('good') || lower.includes('nice') || lower.includes('great')) return '👍'
  if (lower.includes('thanks') || lower.includes('thank')) return '🙏'
  
  // Gaming emoji for general gaming content
  if (lower.includes('game') || lower.includes('play') || lower.includes('rank')) return '🎮'
  
  return null
}

// Generate advanced AI response
async function generateCarlcordResponse(messageContent, context, recentMessages = [], userHistory = []) {
  try {
    const { channelContext, serverContext, userId } = context
    
    // Get game context
    let gameContext = ''
    const detectedGame = detectGame(messageContent)
    if (detectedGame) {
      gameContext = getMinimalGameContext(detectedGame)
    }
    
    // Build comprehensive context
    let fullContext = ''
    
    if (serverContext.serverName) {
      fullContext += `\n[Server Context]:\nServer: ${serverContext.serverName}`
      if (serverContext.serverDescription) {
        fullContext += `\nDescription: ${serverContext.serverDescription}`
      }
      fullContext += `\nMembers: ${serverContext.memberCount}`
    }
    
    if (channelContext.channelName) {
      fullContext += `\n[Channel Context]:\nName: ${channelContext.channelName} (${channelContext.channelType})`
      if (channelContext.channelTopic) {
        fullContext += `\nTopic: ${channelContext.channelTopic}`
      }
    }
    
    if (gameContext) {
      fullContext += `\n\n[Game Context]:\n${gameContext}`
    }
    
    // Add recent conversation context
    if (recentMessages.length > 0) {
      fullContext += '\n\n[Recent Messages]:\n'
      recentMessages.slice(-8).forEach(msg => {
        const username = msg.display_name || msg.username || 'User'
        fullContext += `${username}: ${msg.content}\n`
      })
    }
    
    // Add user history for personalization
    if (userHistory.length > 0) {
      fullContext += '\n\n[User\'s Recent Messages for Context]:\n'
      userHistory.slice(-3).forEach(msg => {
        fullContext += `User: ${msg.content}\n`
      })
      fullContext += '\nUse this to understand user\'s preferences and past conversations.\n'
    }
    
    fullContext += '\nRespond naturally, be helpful, and match the conversation tone.'
    
    const messages = [
      {
        role: 'system',
        content: CARLCORD_SYSTEM_PROMPT + fullContext
      },
      {
        role: 'user',
        content: messageContent
      }
    ]
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 250, // Increased for more detailed responses
      temperature: 0.85
    }).catch(async (error) => {
      if (error.code === 'model_not_found') {
        return await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: messages,
          max_tokens: 250,
          temperature: 0.85
        })
      }
      throw error
    })
    
    const response = completion.choices[0]?.message?.content?.trim()
    return response || null
  } catch (error) {
    console.error('Error generating Carlcord response:', error)
    return null
  }
}

// Main message processing function
export async function processCarlcordMessage(messageId, channelId, serverId, userId, messageContent) {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    
    // Don't respond to own messages
    if (userId === carlbotId) {
      return
    }
    
    // Get recent messages for context
    const recentMessages = db.prepare(`
      SELECT m.content, m.user_id, u.username, up.display_name, m.created_at
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE m.channel_id = ? AND m.id != ?
      ORDER BY m.created_at DESC
      LIMIT 15
    `).all(channelId, messageId)
    
    // Check if bot should respond
    if (!shouldBotRespond(messageContent, channelId, userId, recentMessages)) {
      // Still might want to react to message
      const reaction = getReactionForMessage(messageContent)
      if (reaction && Math.random() < 0.3) { // 30% chance to react
        await addReaction(db, messageId, reaction, carlbotId)
      }
      return
    }
    
    // Handle slash commands
    const commandMatch = messageContent.match(/^\/(\w+)(?:\s+(.+))?/)
    if (commandMatch) {
      const [, command, args] = commandMatch
      
      // Get context for command
      const channel = db.prepare('SELECT name, type, topic FROM channels WHERE id = ?').get(channelId)
      const serverContext = getServerContext(db, serverId, channelId)
      const channelContext = {
        channelName: channel?.name,
        channelType: channel?.type,
        topic: channel?.topic
      }
      
      const commandResponse = await handleSlashCommand(
        command,
        args || '',
        messageContent,
        { channelContext, serverContext, userId }
      )
      
      if (commandResponse !== null) {
        // Create response for slash command
        const result = db.prepare(`
          INSERT INTO channel_messages (channel_id, user_id, content, created_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).run(channelId, carlbotId, commandResponse)
        
        const botMessageId = result.lastInsertRowid
        const botMessage = db.prepare(`
          SELECT m.*, u.username, u.avatar_url, up.display_name
          FROM channel_messages m
          JOIN users u ON m.user_id = u.id
          LEFT JOIN user_profiles up ON u.id = up.user_id
          WHERE m.id = ?
        `).get(botMessageId)
        
        // Convert avatar_url to full URL
        if (botMessage.avatar_url) {
          botMessage.avatar_url = getFullAvatarUrl(botMessage.avatar_url)
        }
        
        const { emitMessage } = await import('../utils/socketEvents.js')
        emitMessage(botMessage)
        return botMessage
      }
      // If command returns null, continue to AI response
    }
    
    // Get comprehensive context
    const channel = db.prepare('SELECT name, type, topic FROM channels WHERE id = ?').get(channelId)
    const serverContext = getServerContext(db, serverId, channelId)
    const channelContext = {
      channelName: channel?.name,
      channelType: channel?.type,
      topic: channel?.topic
    }
    
    // Get user history for personalization
    const userHistory = getUserHistory(db, userId, channelId, 5)
    
    // Generate AI response
    const response = await generateCarlcordResponse(
      messageContent,
      { channelContext, serverContext, userId },
      recentMessages.reverse(), // Chronological order
      userHistory
    )
    
    if (!response) {
      return
    }
    
    // Create bot message
    const result = db.prepare(`
      INSERT INTO channel_messages (
        channel_id, user_id, content, created_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(channelId, carlbotId, response)
    
    const botMessageId = result.lastInsertRowid
    
    // Get the created message with user info
    const botMessage = db.prepare(`
      SELECT m.*, u.username, u.avatar_url, up.display_name
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE m.id = ?
    `).get(botMessageId)
    
    // Convert avatar_url to full URL
    if (botMessage.avatar_url) {
      botMessage.avatar_url = getFullAvatarUrl(botMessage.avatar_url)
    }
    
    // Emit message via Socket.io
    const { emitMessage } = await import('../utils/socketEvents.js')
    emitMessage(botMessage)
    
    // Add reaction to original message if appropriate
    const reaction = getReactionForMessage(messageContent)
    if (reaction && Math.random() < 0.5) { // 50% chance
      await addReaction(db, messageId, reaction, carlbotId)
    }
    
    // Log bot activity
    if (logBotActivity) {
      logBotActivity({
        action: 'carlcord_message',
        details: {
          channel_id: channelId,
          server_id: serverId,
          responding_to: messageId,
          response_length: response.length,
          command_used: commandMatch ? commandMatch[1] : null
        }
      })
    }
    
    console.log(`🤖 Carlbot responded in channel ${channelId}: ${response.substring(0, 50)}...`)
    
    return botMessage
  } catch (error) {
    console.error('Error processing Carlcord message for bot:', error)
    return null
  }
}

// API endpoint to manually trigger bot response (for testing)
router.post('/respond', async (req, res) => {
  try {
    const { message_id, channel_id, server_id, user_id, content } = req.body
    
    if (!message_id || !channel_id || !server_id || !user_id || !content) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    const botMessage = await processCarlcordMessage(message_id, channel_id, server_id, user_id, content)
    
    if (botMessage) {
      res.json({ success: true, message: botMessage })
    } else {
      res.json({ success: false, message: 'Bot did not respond' })
    }
  } catch (error) {
    console.error('Error in bot respond endpoint:', error)
    res.status(500).json({ error: 'Failed to process bot response' })
  }
})

export default router
