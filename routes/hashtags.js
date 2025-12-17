import express from 'express'
import { getDatabase } from '../database/init.js'
import { optionalAuth } from '../middleware/auth.js'
import OpenAI from 'openai'
import dotenv from 'dotenv'

dotenv.config()

const router = express.Router()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Get intelligent trending topics (AI-powered topic detection)
// Must be before /:tag route
router.get('/intelligent-trending', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const limit = parseInt(req.query.limit) || 10
    
    // Get recent posts from last 24 hours
    const recentPosts = db.prepare(`
      SELECT 
        sp.id,
        sp.content,
        sp.title,
        g.name as game_name,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count
      FROM social_posts sp
      LEFT JOIN games g ON sp.game_id = g.id
      WHERE sp.is_public = 1 
        AND datetime(sp.created_at) > datetime('now', '-24 hours')
      ORDER BY sp.created_at DESC
      LIMIT 100
    `).all()
    
    if (recentPosts.length === 0) {
      return res.json([])
    }
    
    // Extract text content from posts
    const postTexts = recentPosts.map(post => {
      const text = `${post.title || ''} ${post.content || ''}`.trim()
      return text.substring(0, 200) // Limit length for AI processing
    }).filter(text => text.length > 0)
    
    if (postTexts.length === 0) {
      return res.json([])
    }
    
    // Use AI to extract trending topics
    const topicsPrompt = `Analyze these social media posts and identify the main trending topics, games, or subjects being discussed. Extract key topics that appear multiple times.

Posts:
${postTexts.slice(0, 50).map((text, idx) => `${idx + 1}. ${text}`).join('\n')}

Return ONLY a JSON array of trending topics. Each topic should be an object with:
- "topic": the topic name (e.g., "Fortnite", "Valorant", "Gaming Strategy", "Build Analysis")
- "category": the category (e.g., "Gaming", "Strategy", "General")
- "mention_count": estimated number of times this topic appears

Format: [{"topic": "Fortnite", "category": "Gaming", "mention_count": 15}, ...]

Return at most ${limit} topics, sorted by mention_count descending.`
    
    let aiTopics = []
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a topic extraction system. Analyze social media posts and identify trending topics. Return ONLY valid JSON array, no other text.' 
          },
          { role: 'user', content: topicsPrompt }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
      
      const responseText = completion.choices[0]?.message?.content || '[]'
      // Try to extract JSON from response (in case AI adds extra text)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        aiTopics = JSON.parse(jsonMatch[0])
      } else {
        aiTopics = JSON.parse(responseText)
      }
    } catch (aiError) {
      console.error('AI topic extraction error:', aiError)
      // Fallback to keyword-based detection
      aiTopics = extractTopicsFallback(recentPosts)
    }
    
    // Validate and format topics
    const trendingTopics = aiTopics
      .filter(topic => topic && topic.topic && topic.mention_count >= 3) // At least 3 mentions
      .map(topic => ({
        id: `topic_${topic.topic.toLowerCase().replace(/\s+/g, '_')}`,
        name: topic.topic,
        tag: `#${topic.topic.replace(/\s+/g, '')}`,
        category: topic.category || 'Gaming',
        post_count: topic.mention_count || 0,
        count: topic.mention_count || 0
      }))
      .sort((a, b) => b.post_count - a.post_count)
      .slice(0, limit)
    
    res.json(trendingTopics)
  } catch (error) {
    console.error('Get intelligent trending error:', error)
    res.status(500).json({ error: 'Failed to get trending topics' })
  }
})

// Fallback keyword-based topic extraction
function extractTopicsFallback(posts) {
  const topicCounts = {}
  const commonGames = ['fortnite', 'valorant', 'league of legends', 'apex legends', 'csgo', 'overwatch', 'dota', 'pubg', 'warzone', 'rocket league']
  const commonTerms = ['build', 'strategy', 'meta', 'patch', 'update', 'nerf', 'buff', 'tier list', 'ranked', 'competitive']
  
  posts.forEach(post => {
    const text = `${post.title || ''} ${post.content || ''}`.toLowerCase()
    
    // Check for game mentions
    commonGames.forEach(game => {
      if (text.includes(game)) {
        topicCounts[game] = (topicCounts[game] || 0) + 1
      }
    })
    
    // Check for common terms
    commonTerms.forEach(term => {
      if (text.includes(term)) {
        topicCounts[term] = (topicCounts[term] || 0) + 1
      }
    })
    
    // Extract hashtags
    const hashtags = text.match(/#\w+/g) || []
    hashtags.forEach(tag => {
      const cleanTag = tag.replace('#', '')
      if (cleanTag.length > 2) {
        topicCounts[cleanTag] = (topicCounts[cleanTag] || 0) + 1
      }
    })
  })
  
  return Object.entries(topicCounts)
    .filter(([_, count]) => count >= 3)
    .map(([topic, count]) => ({
      topic: topic.charAt(0).toUpperCase() + topic.slice(1),
      category: 'Gaming',
      mention_count: count
    }))
    .sort((a, b) => b.mention_count - a.mention_count)
}

// Get trending hashtags
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const limit = parseInt(req.query.limit) || 20
    
    const hashtags = db.prepare(`
      SELECT 
        h.*,
        COUNT(ph.post_id) as recent_posts
      FROM hashtags h
      LEFT JOIN post_hashtags ph ON h.id = ph.hashtag_id
      LEFT JOIN social_posts sp ON ph.post_id = sp.id
      WHERE sp.created_at >= datetime('now', '-7 days')
      GROUP BY h.id
      ORDER BY recent_posts DESC, h.post_count DESC
      LIMIT ?
    `).all(limit)
    
    res.json(hashtags)
  } catch (error) {
    console.error('Get trending hashtags error:', error)
    res.status(500).json({ error: 'Failed to get trending hashtags' })
  }
})

// Get posts by hashtag
router.get('/:tag/posts', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const tag = req.params.tag.toLowerCase()
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit
    
    const hashtag = db.prepare('SELECT * FROM hashtags WHERE tag = ?').get(tag)
    if (!hashtag) {
      return res.status(404).json({ error: 'Hashtag not found' })
    }
    
    const userId = req.user?.id || null
    
    // Build query based on authentication
    let posts
    if (userId) {
      posts = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          c.name as community_name,
          c.slug as community_slug,
          c.icon as community_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id AND user_id = ?) as is_shared
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN games g ON sp.game_id = g.id
        LEFT JOIN communities c ON sp.community_id = c.id
        JOIN post_hashtags ph ON sp.id = ph.post_id
        WHERE ph.hashtag_id = ?
          AND sp.is_public = 1
        ORDER BY sp.created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, userId, userId, hashtag.id, limit, offset)
    } else {
      posts = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          c.name as community_name,
          c.slug as community_slug,
          c.icon as community_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
          0 as is_liked,
          0 as is_retweeted,
          0 as is_shared
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN games g ON sp.game_id = g.id
        LEFT JOIN communities c ON sp.community_id = c.id
        JOIN post_hashtags ph ON sp.id = ph.post_id
        WHERE ph.hashtag_id = ?
          AND sp.is_public = 1
        ORDER BY sp.created_at DESC
        LIMIT ? OFFSET ?
      `).all(hashtag.id, limit, offset)
    }
    
    res.json({
      hashtag,
      posts,
      page,
      limit,
      total: hashtag.post_count
    })
  } catch (error) {
    console.error('Get hashtag posts error:', error)
    res.status(500).json({ error: 'Failed to get hashtag posts' })
  }
})

export default router

