import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Get user analytics
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    // Get basic stats
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM social_posts WHERE user_id = ?) as total_posts,
        (SELECT COUNT(*) FROM post_comments WHERE user_id = ?) as total_comments,
        (SELECT COUNT(*) FROM user_follows WHERE following_id = ?) as followers,
        (SELECT COUNT(*) FROM user_follows WHERE follower_id = ?) as following,
        (SELECT COALESCE(SUM(likes_count), 0) FROM social_posts WHERE user_id = ?) as total_likes_received,
        (SELECT COALESCE(SUM(comments_count), 0) FROM social_posts WHERE user_id = ?) as total_comments_received
    `).get(userId, userId, userId, userId, userId, userId)
    
    // Get posts over time (last 30 days)
    const postsOverTime = db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as count
      FROM social_posts
      WHERE user_id = ? AND datetime(created_at) > datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(userId)
    
    // Get engagement over time
    const engagementOverTime = db.prepare(`
      SELECT 
        date(sp.created_at) as date,
        SUM(sp.likes_count) as likes,
        SUM(sp.comments_count) as comments
      FROM social_posts sp
      WHERE sp.user_id = ? AND datetime(sp.created_at) > datetime('now', '-30 days')
      GROUP BY date(sp.created_at)
      ORDER BY date ASC
    `).all(userId)
    
    // Get top performing posts
    const topPosts = db.prepare(`
      SELECT 
        id,
        content,
        likes_count,
        comments_count,
        created_at,
        (likes_count + comments_count * 2) as engagement_score
      FROM social_posts
      WHERE user_id = ?
      ORDER BY engagement_score DESC
      LIMIT 10
    `).all(userId)
    
    // Get game distribution
    const gameDistribution = db.prepare(`
      SELECT 
        g.name as game_name,
        g.icon as game_icon,
        COUNT(*) as post_count
      FROM social_posts sp
      LEFT JOIN games g ON sp.game_id = g.id
      WHERE sp.user_id = ?
      GROUP BY sp.game_id
      ORDER BY post_count DESC
      LIMIT 10
    `).all(userId)
    
    // Get follower growth (last 30 days)
    const followerGrowth = db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as new_followers
      FROM user_follows
      WHERE following_id = ? AND datetime(created_at) > datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(userId)
    
    // Calculate engagement rate
    const totalEngagement = (stats.total_likes_received || 0) + (stats.total_comments_received || 0)
    const engagementRate = stats.total_posts > 0 
      ? ((totalEngagement / stats.total_posts) * 100).toFixed(2)
      : 0
    
    res.json({
      stats: {
        ...stats,
        engagement_rate: parseFloat(engagementRate),
        total_engagement: totalEngagement
      },
      postsOverTime,
      engagementOverTime,
      topPosts,
      gameDistribution,
      followerGrowth
    })
  } catch (error) {
    console.error('Get analytics error:', error)
    console.error('Error stack:', error.stack)
    res.status(500).json({ error: error.message || 'Failed to get analytics' })
  }
})

// Get post analytics
router.get('/post/:postId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const postId = parseInt(req.params.postId)
    const userId = req.user.id
    
    // Verify post belongs to user
    const post = db.prepare('SELECT user_id FROM social_posts WHERE id = ?').get(postId)
    if (!post || post.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    // Get post stats
    const postStats = db.prepare(`
      SELECT 
        sp.*,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as actual_likes,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as actual_comments,
        (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as actual_retweets
      FROM social_posts sp
      WHERE sp.id = ?
    `).get(postId)
    
    // Get likes over time
    const likesOverTime = db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as count
      FROM post_likes
      WHERE post_id = ?
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(postId)
    
    // Get comments over time
    const commentsOverTime = db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as count
      FROM post_comments
      WHERE post_id = ?
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(postId)
    
    res.json({
      post: postStats,
      likesOverTime,
      commentsOverTime,
      engagementRate: postStats.actual_likes + postStats.actual_comments * 2
    })
  } catch (error) {
    console.error('Get post analytics error:', error)
    console.error('Error stack:', error.stack)
    res.status(500).json({ error: error.message || 'Failed to get post analytics' })
  }
})

export default router
