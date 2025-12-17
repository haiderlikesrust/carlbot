import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Bookmark a post
router.post('/:postId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const postId = parseInt(req.params.postId)
    
    // Check if already bookmarked
    const existing = db.prepare(`
      SELECT * FROM bookmarks
      WHERE user_id = ? AND post_id = ?
    `).get(userId, postId)
    
    if (existing) {
      return res.status(400).json({ error: 'Post already bookmarked' })
    }
    
    // Create bookmark
    db.prepare(`
      INSERT INTO bookmarks (user_id, post_id)
      VALUES (?, ?)
    `).run(userId, postId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Bookmark error:', error)
    res.status(500).json({ error: 'Failed to bookmark post' })
  }
})

// Unbookmark a post
router.delete('/:postId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const postId = parseInt(req.params.postId)
    
    db.prepare(`
      DELETE FROM bookmarks
      WHERE user_id = ? AND post_id = ?
    `).run(userId, postId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Unbookmark error:', error)
    res.status(500).json({ error: 'Failed to unbookmark post' })
  }
})

// Get all bookmarked posts
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    const bookmarks = db.prepare(`
      SELECT 
        sp.*,
        u.username,
        u.avatar_url,
        g.name as game_name,
        g.icon as game_icon,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
        (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
        (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
        (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted,
        (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id AND user_id = ?) as is_shared,
        1 as is_bookmarked,
        b.created_at as bookmarked_at
      FROM bookmarks b
      JOIN social_posts sp ON b.post_id = sp.id
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN games g ON sp.game_id = g.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(userId, userId, userId, userId)
    
    res.json(bookmarks)
  } catch (error) {
    console.error('Get bookmarks error:', error)
    res.status(500).json({ error: 'Failed to get bookmarks' })
  }
})

// Check if post is bookmarked
router.get('/:postId/check', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const postId = parseInt(req.params.postId)
    
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM bookmarks
      WHERE user_id = ? AND post_id = ?
    `).get(userId, postId)
    
    res.json({ isBookmarked: result.count > 0 })
  } catch (error) {
    console.error('Check bookmark error:', error)
    res.status(500).json({ error: 'Failed to check bookmark status' })
  }
})

export default router

