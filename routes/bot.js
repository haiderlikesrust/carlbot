import express from 'express'
import { getDatabase } from '../database/init.js'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import { createCarlbot } from '../scripts/create-carlbot.js'
import { detectGame, getMinimalGameContext } from '../utils/gameDetector.js'
import { logBotActivity } from './admin.js'

dotenv.config()

const router = express.Router()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Carl's system prompt (same as main chat)
const CARL_SYSTEM_PROMPT = `You are Carl, a hardcore gaming strategist and pro player. You're brutally honest, sarcastic, and tactical. You know everything about competitive gaming, meta builds, strategies, and game mechanics. Keep responses SHORT and punchy (30-60 words max). Never break character. Give tactical gaming advice, not generic tips.

CRITICAL: When discussing trending posts or social feed content, you MUST accurately summarize the ACTUAL content provided. Read the exact post content and reflect what it actually says. Do NOT make up generic meta summaries or assume what posts contain.

COMMUNICATION STYLE: Respond like a real human, not an assistant. Keep replies natural, conversational, and emotionally aware. Match the user's tone, energy, and message length. Use casual language, contractions, and varied sentence flow. Avoid robotic phrasing, excessive structure, or over-explaining. Show empathy when needed, personality when appropriate, and clarity at all times. Prioritize sounding genuine and relatable over sounding complete or formal.`

// Get or create Carlbot user ID
export async function getCarlbotId() {
  const db = getDatabase()
  let carlbot = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
  
  if (!carlbot) {
    const carlbotId = await createCarlbot()
    return carlbotId
  }
  
  return carlbot.id
}

// Get Carlbot's token (for authenticated requests)
async function getCarlbotToken() {
  // In a real implementation, you'd generate/store a JWT token for the bot
  // For now, we'll use the bot's user ID directly in the database operations
  return null
}

// Get learning insights from past interactions
function getLearningInsights(db, carlbotId) {
  try {
    // Get successful interactions (comments that got likes)
    const successfulComments = db.prepare(`
      SELECT pc.comment, pc.likes_count, sp.content as post_content, sp.game_id, g.name as game_name
      FROM post_comments pc
      JOIN social_posts sp ON pc.post_id = sp.id
      LEFT JOIN games g ON sp.game_id = g.id
      WHERE pc.user_id = ? AND pc.likes_count > 0
      ORDER BY pc.likes_count DESC, pc.created_at DESC
      LIMIT 5
    `).all(carlbotId)
    
    // Get interaction patterns
    const interactionStats = db.prepare(`
      SELECT 
        COUNT(DISTINCT CASE WHEN pl.id IS NOT NULL THEN sp.id END) as liked_posts,
        COUNT(DISTINCT CASE WHEN pc.id IS NOT NULL THEN sp.id END) as commented_posts,
        COUNT(DISTINCT CASE WHEN pr.id IS NOT NULL THEN sp.id END) as retweeted_posts,
        AVG(CASE WHEN pc.id IS NOT NULL THEN pc.likes_count ELSE 0 END) as avg_comment_likes
      FROM social_posts sp
      LEFT JOIN post_likes pl ON sp.id = pl.post_id AND pl.user_id = ?
      LEFT JOIN post_comments pc ON sp.id = pc.post_id AND pc.user_id = ?
      LEFT JOIN post_retweets pr ON sp.id = pr.original_post_id AND pr.user_id = ?
      WHERE (pl.id IS NOT NULL OR pc.id IS NOT NULL OR pr.id IS NOT NULL)
        AND datetime(sp.created_at) > datetime('now', '-7 days')
    `).get(carlbotId, carlbotId, carlbotId)
    
    return {
      successfulComments,
      stats: interactionStats
    }
  } catch (error) {
    console.error('Error getting learning insights:', error)
    return { successfulComments: [], stats: {} }
  }
}

// AI decision: Should Carlbot interact with this post?
async function shouldInteract(post, interactionType, db, carlbotId) {
  try {
    // Get game context if available
    let gameContext = ''
    if (post.game_name) {
      const detectedGame = detectGame(post.content + ' ' + post.game_name)
      if (detectedGame) {
        gameContext = getMinimalGameContext(detectedGame) + '\n'
      }
    }
    
    // Get learning insights
    const insights = getLearningInsights(db, carlbotId)
    let learningContext = ''
    if (insights.successfulComments.length > 0) {
      learningContext = '\n\n[Learning from successful past interactions]:\n'
      insights.successfulComments.slice(0, 3).forEach((comment, idx) => {
        learningContext += `${idx + 1}. Comment that got ${comment.likes_count} likes on "${comment.post_content.substring(0, 50)}...": "${comment.comment.substring(0, 60)}..."\n`
      })
      learningContext += 'Use similar style and approach for high-quality interactions.\n'
    }
    
    const prompt = `You are Carlbot, an active gaming community member. Analyze this post and decide if you should ${interactionType} it.

Post: "${post.content}"
Author: @${post.username}
Game: ${post.game_name || 'General gaming'}
Engagement: ${post.likes_count || 0} likes, ${post.comments_count || 0} comments
${gameContext}${learningContext}

Guidelines for ${interactionType}:
${interactionType === 'like' ? '- LIKE if the post is about gaming, strategies, builds, meta, questions, or interesting content\n- LIKE if it has any gaming relevance\n- Only skip obvious spam, hate speech, or completely off-topic content\n- Be ACTIVE - like most gaming-related posts' : ''}
${interactionType === 'comment' ? '- COMMENT if you can add value: advice, build feedback, strategy tips, or tactical insights\n- COMMENT on questions, build shares, meta discussions, or strategy posts\n- Be HELPFUL and ACTIVE - comment when you have something useful to say\n- Only skip if you have nothing valuable to add' : ''}
${interactionType === 'retweet' ? '- RETWEET posts with valuable gaming insights, meta discussions, or exceptional content\n- RETWEET to share quality content with the community\n- Be ACTIVE in sharing good content' : ''}

IMPORTANT: Be ACTIVE and ENGAGED. Interact with most gaming-related posts. Only say NO for obvious spam, hate speech, or completely non-gaming content.

Respond with ONLY "YES" or "NO" followed by a brief reason (max 10 words).`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a decision-making assistant. Respond with YES or NO followed by a brief reason.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 50,
      temperature: 0.5
    })

    const response = completion.choices[0]?.message?.content || 'NO'
    const responseUpper = response.trim().toUpperCase()
    
    // More flexible parsing - check for YES in various forms
    const shouldInteract = responseUpper.startsWith('YES') || 
                          responseUpper.startsWith('Y') ||
                          responseUpper.includes('YES') ||
                          (responseUpper.includes('LIKE') && interactionType === 'like') ||
                          (responseUpper.includes('COMMENT') && interactionType === 'comment') ||
                          (responseUpper.includes('RETWEET') && interactionType === 'retweet')
    
    // Fallback: If post has decent engagement and is gaming-related, be more lenient
    const hasEngagement = (post.likes_count || 0) > 0 || (post.comments_count || 0) > 0
    const isGamingRelated = post.game_name || 
                            post.content.toLowerCase().match(/\b(game|build|strategy|meta|nerf|buff|patch|ranked|competitive|gaming|gamer|fortnite|valorant|league|apex|csgo|overwatch|dota|pubg|warzone)\b/i)
    
    // Additional checks: if post is clearly gaming-related, be more active
    const isQuestion = post.content.match(/\?|help|advice|what|how|should/i)
    const hasGamingKeywords = post.content.toLowerCase().match(/\b(build|strategy|meta|tier|rank|competitive|pro|esports|tournament|match|play|win|loss|nerf|buff|patch|update)\b/i)
    
    // If AI said no but post is clearly gaming-related, override (be more active)
    // Only skip if AI explicitly says it's spam or off-topic
    const isSpamOrOffTopic = responseUpper.includes('SPAM') || 
                             responseUpper.includes('OFF-TOPIC') || 
                             responseUpper.includes('NOT GAMING') ||
                             responseUpper.includes('IRRELEVANT')
    
    const finalDecision = shouldInteract || 
                         (isGamingRelated && !isSpamOrOffTopic) ||
                         (hasEngagement && !isSpamOrOffTopic) ||
                         (isQuestion && !isSpamOrOffTopic) ||
                         (hasGamingKeywords && !isSpamOrOffTopic)
    
    // Enhanced decision metadata for logging
    const decisionMetadata = {
      postId: post.id,
      postContent: post.content.substring(0, 100),
      author: post.username,
      game: post.game_name || 'None',
      engagement: {
        likes: post.likes_count || 0,
        comments: post.comments_count || 0
      },
      gameContext: gameContext ? 'Detected' : 'None',
      learningContext: insights.successfulComments.length > 0 ? 'Applied' : 'None',
      aiResponse: response,
      decision: shouldInteract ? 'YES' : 'NO',
      timestamp: new Date().toISOString()
    }
    
    return { 
      shouldInteract: finalDecision, 
      reason: finalDecision !== shouldInteract ? `${response} (override: gaming content with engagement)` : response,
      metadata: {
        ...decisionMetadata,
        decision: finalDecision ? 'YES' : 'NO',
        originalAIResponse: response,
        overrideApplied: finalDecision !== shouldInteract
      }
    }
  } catch (error) {
    console.error('AI decision error:', error)
    return { shouldInteract: false, reason: 'Error' }
  }
}

// Generate AI comment with better context
async function generateComment(post, db, carlbotId) {
  try {
    // Get game context
    let gameContext = ''
    if (post.game_name) {
      const detectedGame = detectGame(post.content + ' ' + post.game_name)
      if (detectedGame) {
        gameContext = getMinimalGameContext(detectedGame) + '\n'
      }
    }
    
    // Get learning insights
    const insights = getLearningInsights(db, carlbotId)
    let learningContext = ''
    if (insights.successfulComments.length > 0) {
      learningContext = '\n[Style reference - successful past comments]:\n'
      insights.successfulComments.slice(0, 2).forEach((comment, idx) => {
        learningContext += `- "${comment.comment}" (got ${comment.likes_count} likes)\n`
      })
      learningContext += 'Match this style: direct, tactical, valuable.\n'
    }
    
    // Check if there are existing comments to avoid repetition
    const existingComments = db.prepare(`
      SELECT comment FROM post_comments 
      WHERE post_id = ? AND user_id != ?
      ORDER BY created_at DESC
      LIMIT 3
    `).all(post.id, carlbotId)
    
    let existingContext = ''
    if (existingComments.length > 0) {
      existingContext = '\n[Existing comments on this post - be different]:\n'
      existingComments.forEach((c, idx) => {
        existingContext += `${idx + 1}. "${c.comment.substring(0, 60)}..."\n`
      })
      existingContext += 'Provide a unique perspective, don\'t repeat what others said.\n'
    }
    
    const prompt = `${CARL_SYSTEM_PROMPT}

Write a brief, tactical comment on this post. Be Carl - direct, honest, gaming-focused.

Post: "${post.content}"
Game: ${post.game_name || 'General gaming'}
${gameContext}${learningContext}${existingContext}
Rules:
- Keep it under 50 words
- Be tactical and helpful
- Match Carl's personality: brutally honest, sarcastic, tactical
- Provide value or insight
- Use gaming terminology naturally
- Be unique - don't repeat existing comments

Write only the comment, nothing else.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CARL_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.8
    })

    return completion.choices[0]?.message?.content?.trim() || 'Interesting post!'
  } catch (error) {
    console.error('Comment generation error:', error)
    return 'Interesting post!'
  }
}

// Like a post
router.post('/like/:postId', async (req, res) => {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    const postId = parseInt(req.params.postId)
    
    // Get post
    const post = db.prepare(`
      SELECT sp.*, u.username, g.name as game_name, c.name as community_name,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count
      FROM social_posts sp
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN games g ON sp.game_id = g.id
      LEFT JOIN communities c ON sp.community_id = c.id
      WHERE sp.id = ?
    `).get(postId)
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    // Check if already liked
    const existing = db.prepare(`
      SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?
    `).get(postId, carlbotId)
    
    if (existing) {
      return res.json({ success: true, message: 'Already liked' })
    }
    
    // AI decision
    const decision = await shouldInteract(post, 'like', db, carlbotId)
    if (!decision.shouldInteract) {
      // Log the decision even when not interacting
      logBotActivity(db, carlbotId, 'decision_like', `Decided NOT to like post ${postId}`, 'post', postId, true, null, decision.metadata)
      return res.json({ success: false, message: 'AI decided not to like', reason: decision.reason })
    }
    
    // Like the post
    db.prepare(`
      INSERT INTO post_likes (post_id, user_id)
      VALUES (?, ?)
    `).run(postId, carlbotId)
    
    // Update likes count
    db.prepare('UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId)
    
    // Log activity with full decision metadata
    logBotActivity(db, carlbotId, 'like', `Liked post ${postId}`, 'post', postId, true, null, decision.metadata)
    
    console.log(`🤖 Carlbot liked post ${postId}: ${decision.reason}`)
    res.json({ success: true, message: 'Post liked', reason: decision.reason })
  } catch (error) {
    console.error('Bot like error:', error)
    res.status(500).json({ error: 'Failed to like post' })
  }
})

// Comment on a post
router.post('/comment/:postId', async (req, res) => {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    const postId = parseInt(req.params.postId)
    
    // Get post
    const post = db.prepare(`
      SELECT sp.*, u.username, g.name as game_name, c.name as community_name,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count
      FROM social_posts sp
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN games g ON sp.game_id = g.id
      LEFT JOIN communities c ON sp.community_id = c.id
      WHERE sp.id = ?
    `).get(postId)
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    // AI decision
    const decision = await shouldInteract(post, 'comment', db, carlbotId)
    if (!decision.shouldInteract) {
      // Log the decision even when not commenting
      logBotActivity(db, carlbotId, 'decision_comment', `Decided NOT to comment on post ${postId}`, 'post', postId, true, null, decision.metadata)
      return res.json({ success: false, message: 'AI decided not to comment', reason: decision.reason })
    }
    
    // Generate comment
    const commentText = await generateComment(post, db, carlbotId)
    
    // Add comment
    const result = db.prepare(`
      INSERT INTO post_comments (post_id, user_id, comment)
      VALUES (?, ?, ?)
    `).run(postId, carlbotId, commentText)
    
    // Update comments count (only for top-level comments)
    db.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId)
    
    // Log activity with full decision metadata
    const commentMetadata = decision.metadata ? { ...decision.metadata } : {}
    commentMetadata.comment = commentText.substring(0, 100)
    commentMetadata.generatedComment = commentText
    logBotActivity(db, carlbotId, 'comment', `Commented on post ${postId}`, 'post', postId, true, null, commentMetadata)
    
    console.log(`🤖 Carlbot commented on post ${postId}: "${commentText.substring(0, 50)}..."`)
    res.json({ success: true, comment: commentText, reason: decision.reason })
  } catch (error) {
    console.error('Bot comment error:', error)
    res.status(500).json({ error: 'Failed to comment' })
  }
})

// Retweet a post
router.post('/retweet/:postId', async (req, res) => {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    const postId = parseInt(req.params.postId)
    
    // Get post
    const post = db.prepare(`
      SELECT sp.*, u.username, g.name as game_name, c.name as community_name,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count
      FROM social_posts sp
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN games g ON sp.game_id = g.id
      LEFT JOIN communities c ON sp.community_id = c.id
      WHERE sp.id = ?
    `).get(postId)
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    // Check if already retweeted
    const existing = db.prepare(`
      SELECT id FROM post_retweets WHERE original_post_id = ? AND user_id = ?
    `).get(postId, carlbotId)
    
    if (existing) {
      return res.json({ success: true, message: 'Already retweeted' })
    }
    
    // AI decision
    const decision = await shouldInteract(post, 'retweet', db, carlbotId)
    if (!decision.shouldInteract) {
      // Log the decision even when not retweeting
      logBotActivity(db, carlbotId, 'decision_retweet', `Decided NOT to retweet post ${postId}`, 'post', postId, true, null, decision.metadata)
      return res.json({ success: false, message: 'AI decided not to retweet', reason: decision.reason })
    }
    
    // Retweet
    db.prepare(`
      INSERT INTO post_retweets (original_post_id, user_id)
      VALUES (?, ?)
    `).run(postId, carlbotId)
    
    // Update retweets count
    db.prepare('UPDATE social_posts SET retweets_count = retweets_count + 1 WHERE id = ?').run(postId)
    
    // Log activity with full decision metadata
    logBotActivity(db, carlbotId, 'retweet', `Retweeted post ${postId}`, 'post', postId, true, null, decision.metadata)
    
    console.log(`🤖 Carlbot retweeted post ${postId}: ${decision.reason}`)
    res.json({ success: true, message: 'Post retweeted', reason: decision.reason })
  } catch (error) {
    console.error('Bot retweet error:', error)
    res.status(500).json({ error: 'Failed to retweet' })
  }
})

// Auto-interact with trending posts
router.post('/auto-interact', async (req, res) => {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    const { limit = 10 } = req.body
    
    // Check if auto-interact is enabled
    const config = db.prepare('SELECT config_value FROM bot_config WHERE config_key = ?').get('auto_interact_enabled')
    const isEnabled = !config || config.config_value === 'true'
    
    if (!isEnabled) {
      return res.json({ success: false, message: 'Auto-interact is disabled', interactions: [], count: 0 })
    }
    
    // Get trending posts (last 24 hours, not already interacted with)
    // Also check for comments to avoid duplicate comments
    const trendingPosts = db.prepare(`
      SELECT 
        sp.*,
        u.username,
        g.name as game_name,
        g.icon as game_icon,
        c.name as community_name,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
        (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = ?) as has_commented,
        (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted
      FROM social_posts sp
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN games g ON sp.game_id = g.id
      LEFT JOIN communities c ON sp.community_id = c.id
      WHERE sp.is_public = 1
        AND sp.user_id != ?
        AND datetime(sp.created_at) > datetime('now', '-24 hours')
        AND (sp.community_id IS NULL OR c.is_public = 1)
      ORDER BY (likes_count + comments_count * 2 + retweets_count * 1.5) DESC
      LIMIT ?
    `).all(carlbotId, carlbotId, carlbotId, carlbotId, limit)
    
    const interactions = []
    
    console.log(`📊 Found ${trendingPosts.length} trending posts to evaluate`)
    
    for (const post of trendingPosts) {
      // Skip if already fully interacted (liked AND commented AND retweeted)
      if (post.is_liked && post.has_commented && post.is_retweeted) {
        console.log(`⏭️ Skipping post ${post.id} - already fully interacted`)
        continue
      }
      
      // Skip own posts
      if (post.user_id === carlbotId) {
        continue
      }
      
      console.log(`🔍 Evaluating post ${post.id}: "${post.content.substring(0, 50)}..." (${post.likes_count} likes, ${post.comments_count} comments)`)
      
      // Try to interact - be more active!
      // Strategy: Try comment first (most valuable), then like, then retweet
      let interacted = false
      
      // 1. Try to comment (60% chance, but if post asks questions or needs advice, always try)
      const needsComment = post.content.match(/\?|help|advice|what|how|should|build|strategy|meta/i) || 
                          (post.comments_count || 0) < 3 // Low engagement, add value
      const shouldTryComment = (needsComment || Math.random() < 0.6) && !post.has_commented
      
      if (shouldTryComment && !interacted) {
        const decision = await shouldInteract(post, 'comment', db, carlbotId)
        console.log(`  💬 Comment decision for post ${post.id}: ${decision.shouldInteract ? 'YES' : 'NO'} - ${decision.reason}`)
        if (decision.shouldInteract) {
          try {
            const comment = await generateComment(post, db, carlbotId)
            // Double-check if already commented (race condition protection)
            const existingComment = db.prepare('SELECT id FROM post_comments WHERE post_id = ? AND user_id = ?').get(post.id, carlbotId)
            if (!existingComment) {
              db.prepare('INSERT INTO post_comments (post_id, user_id, comment) VALUES (?, ?, ?)').run(post.id, carlbotId, comment)
              db.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?').run(post.id)
              const autoCommentMetadata = decision.metadata ? { ...decision.metadata } : {}
              autoCommentMetadata.comment = comment.substring(0, 100)
              autoCommentMetadata.generatedComment = comment
              logBotActivity(db, carlbotId, 'comment', `Auto-commented on post ${post.id}`, 'post', post.id, true, null, autoCommentMetadata)
              interactions.push({ type: 'comment', postId: post.id, comment, reason: decision.reason })
              interacted = true
              console.log(`  ✅ Commented on post ${post.id}`)
            } else {
              console.log(`  ⏭️ Already commented on post ${post.id}`)
            }
          } catch (commentError) {
            console.error(`  ❌ Failed to comment on post ${post.id}:`, commentError)
          }
        } else {
          logBotActivity(db, carlbotId, 'decision_comment', `Decided NOT to comment on post ${post.id}`, 'post', post.id, true, null, decision.metadata)
        }
      }
      
      // 2. If didn't comment, try to like (70% chance)
      if (!interacted && !post.is_liked && Math.random() < 0.7) {
        const decision = await shouldInteract(post, 'like', db, carlbotId)
        console.log(`  👍 Like decision for post ${post.id}: ${decision.shouldInteract ? 'YES' : 'NO'} - ${decision.reason}`)
        if (decision.shouldInteract) {
          try {
            // Double-check if already liked
            const existingLike = db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?').get(post.id, carlbotId)
            if (!existingLike) {
              db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(post.id, carlbotId)
              db.prepare('UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = ?').run(post.id)
              logBotActivity(db, carlbotId, 'like', `Auto-liked post ${post.id}`, 'post', post.id, true, null, decision.metadata)
              interactions.push({ type: 'like', postId: post.id, reason: decision.reason })
              interacted = true
              console.log(`  ✅ Liked post ${post.id}`)
            } else {
              console.log(`  ⏭️ Already liked post ${post.id}`)
            }
          } catch (likeError) {
            console.error(`  ❌ Failed to like post ${post.id}:`, likeError)
          }
        } else {
          logBotActivity(db, carlbotId, 'decision_like', `Decided NOT to like post ${post.id}`, 'post', post.id, true, null, decision.metadata)
        }
      }
      
      // 3. If still didn't interact and post has high engagement, try retweet (40% chance)
      if (!interacted && !post.is_retweeted && (post.likes_count + post.comments_count) > 3 && Math.random() < 0.4) {
        const decision = await shouldInteract(post, 'retweet', db, carlbotId)
        console.log(`  🔄 Retweet decision for post ${post.id}: ${decision.shouldInteract ? 'YES' : 'NO'} - ${decision.reason}`)
        if (decision.shouldInteract) {
          try {
            const existingRetweet = db.prepare('SELECT id FROM post_retweets WHERE original_post_id = ? AND user_id = ?').get(post.id, carlbotId)
            if (!existingRetweet) {
              db.prepare('INSERT INTO post_retweets (original_post_id, user_id) VALUES (?, ?)').run(post.id, carlbotId)
              db.prepare('UPDATE social_posts SET retweets_count = retweets_count + 1 WHERE id = ?').run(post.id)
              logBotActivity(db, carlbotId, 'retweet', `Auto-retweeted post ${post.id}`, 'post', post.id, true, null, decision.metadata)
              interactions.push({ type: 'retweet', postId: post.id, reason: decision.reason })
              interacted = true
              console.log(`  ✅ Retweeted post ${post.id}`)
            } else {
              console.log(`  ⏭️ Already retweeted post ${post.id}`)
            }
          } catch (retweetError) {
            console.error(`  ❌ Failed to retweet post ${post.id}:`, retweetError)
          }
        } else {
          logBotActivity(db, carlbotId, 'decision_retweet', `Decided NOT to retweet post ${post.id}`, 'post', post.id, true, null, decision.metadata)
        }
      }
      
      if (!interacted) {
        console.log(`  ⚠️ No interaction made on post ${post.id}`)
      }
      
      // Small delay to avoid rate limiting (reduced for faster processing)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    console.log(`✅ Completed evaluation. Made ${interactions.length} interactions out of ${trendingPosts.length} posts`)
    
    // Update scheduler status
    try {
      const nextRun = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
      db.prepare(`
        INSERT INTO scheduler_status (id, last_run, next_run, is_running, last_run_result, updated_at)
        VALUES (1, CURRENT_TIMESTAMP, ?, 0, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          last_run = CURRENT_TIMESTAMP,
          next_run = excluded.next_run,
          is_running = 0,
          last_run_result = excluded.last_run_result,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        nextRun.toISOString(),
        JSON.stringify({ interactions: interactions.length, totalPosts: trendingPosts.length, success: true })
      )
    } catch (statusError) {
      console.error('Failed to update scheduler status:', statusError)
    }
    
    console.log(`🤖 Carlbot auto-interacted with ${interactions.length} posts out of ${trendingPosts.length} trending posts`)
    if (interactions.length === 0 && trendingPosts.length > 0) {
      console.log('⚠️ Warning: No interactions made. Check decision logs in admin panel.')
    }
    res.json({ success: true, interactions, count: interactions.length, totalPosts: trendingPosts.length })
  } catch (error) {
    console.error('Auto-interact error:', error)
    
    // Update scheduler status with error
    try {
      const db = getDatabase()
      const nextRun = new Date(Date.now() + 30 * 60 * 1000)
      db.prepare(`
        UPDATE scheduler_status 
        SET last_run = CURRENT_TIMESTAMP, 
            next_run = ?,
            is_running = 0,
            last_run_result = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(
        nextRun.toISOString(),
        JSON.stringify({ success: false, error: error.message })
      )
    } catch (statusError) {
      // Ignore status update errors
    }
    
    res.status(500).json({ error: 'Failed to auto-interact' })
  }
})

// Generate and post original content
router.post('/create-post', async (req, res) => {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    const { topic, game_id, community_id } = req.body
    
    // Get trending topics and recent posts for context
    const trendingPosts = db.prepare(`
      SELECT content, game_id, g.name as game_name
      FROM social_posts sp
      LEFT JOIN games g ON sp.game_id = g.id
      WHERE sp.is_public = 1
        AND datetime(sp.created_at) > datetime('now', '-24 hours')
      ORDER BY (likes_count + comments_count * 2) DESC
      LIMIT 5
    `).all()
    
    // Get game context if provided
    let gameContext = ''
    if (game_id) {
      const game = db.prepare('SELECT name FROM games WHERE id = ?').get(game_id)
      if (game) {
        const detectedGame = detectGame(game.name)
        if (detectedGame) {
          gameContext = getMinimalGameContext(detectedGame) + '\n'
        }
      }
    }
    
    // Build prompt for content creation
    const trendingContext = trendingPosts.length > 0 
      ? '\n[Recent trending topics - create something fresh]:\n' + 
        trendingPosts.slice(0, 3).map((p, i) => `${i + 1}. "${p.content.substring(0, 80)}..."`).join('\n') + '\n'
      : ''
    
    const prompt = `${CARL_SYSTEM_PROMPT}

Create an original gaming post. Be Carl - tactical, honest, valuable.

${gameContext}${trendingContext}${topic ? `Topic focus: ${topic}\n` : ''}
Rules:
- Keep it under 150 words
- Be tactical and insightful
- Match Carl's personality: brutally honest, sarcastic, pro-gamer
- Provide real value: meta insights, build tips, strategy advice, or tactical analysis
- Make it engaging and shareable
- Don't repeat recent trending topics exactly - add your unique take

Write only the post content, nothing else.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CARL_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.9
    })

    const postContent = completion.choices[0]?.message?.content?.trim()
    
    if (!postContent) {
      return res.status(500).json({ error: 'Failed to generate post content' })
    }
    
    // Create the post
    const result = db.prepare(`
      INSERT INTO social_posts (user_id, content, game_id, community_id, is_public)
      VALUES (?, ?, ?, ?, 1)
    `).run(carlbotId, postContent, game_id || null, community_id || null)
    
    // Log activity
    logBotActivity(db, carlbotId, 'create_post', `Created original post ${result.lastInsertRowid}`, 'post', result.lastInsertRowid, true, null, { 
      content: postContent.substring(0, 100),
      game_id,
      community_id 
    })
    
    console.log(`🤖 Carlbot created original post ${result.lastInsertRowid}: "${postContent.substring(0, 50)}..."`)
    
    res.json({ 
      success: true, 
      postId: result.lastInsertRowid,
      content: postContent 
    })
  } catch (error) {
    console.error('Create post error:', error)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

// Get Carlbot analytics
router.get('/analytics', async (req, res) => {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    
    // Get interaction stats
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM post_likes WHERE user_id = ?) as total_likes,
        (SELECT COUNT(*) FROM post_comments WHERE user_id = ?) as total_comments,
        (SELECT COUNT(*) FROM post_retweets WHERE user_id = ?) as total_retweets,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = ?) as total_posts,
        (SELECT AVG(likes_count) FROM post_comments WHERE user_id = ?) as avg_comment_likes,
        (SELECT AVG(likes_count) FROM social_posts WHERE user_id = ?) as avg_post_likes
    `).get(carlbotId, carlbotId, carlbotId, carlbotId, carlbotId, carlbotId)
    
    // Get recent performance
    const recentPerformance = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as interactions,
        SUM(CASE WHEN type = 'like' THEN 1 ELSE 0 END) as likes,
        SUM(CASE WHEN type = 'comment' THEN 1 ELSE 0 END) as comments,
        SUM(CASE WHEN type = 'retweet' THEN 1 ELSE 0 END) as retweets
      FROM (
        SELECT 'like' as type, created_at FROM post_likes WHERE user_id = ?
        UNION ALL
        SELECT 'comment' as type, created_at FROM post_comments WHERE user_id = ?
        UNION ALL
        SELECT 'retweet' as type, created_at FROM post_retweets WHERE user_id = ?
      )
      WHERE datetime(created_at) > datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all(carlbotId, carlbotId, carlbotId)
    
    res.json({
      stats,
      recentPerformance,
      insights: getLearningInsights(db, carlbotId)
    })
  } catch (error) {
    console.error('Analytics error:', error)
    res.status(500).json({ error: 'Failed to get analytics' })
  }
})

// Get Carlbot profile
router.get('/profile', async (req, res) => {
  try {
    const db = getDatabase()
    const carlbotId = await getCarlbotId()
    
    const profile = db.prepare(`
      SELECT 
        u.*,
        up.display_name,
        up.bio,
        up.profile_color,
        (SELECT COUNT(*) FROM user_follows WHERE follower_id = ?) as following_count,
        (SELECT COUNT(*) FROM user_follows WHERE following_id = ?) as followers_count,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = ?) as posts_count
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = ?
    `).get(carlbotId, carlbotId, carlbotId, carlbotId)
    
    res.json(profile)
  } catch (error) {
    console.error('Get bot profile error:', error)
    res.status(500).json({ error: 'Failed to get bot profile' })
  }
})

export default router

