import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { createNotification } from './notifications.js'
import { checkAchievements } from './achievements.js'

const router = express.Router()

// Follow a user
router.post('/:userId/follow', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const followerId = req.user.id
    const followingId = parseInt(req.params.userId)
    
    if (followerId === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' })
    }
    
    // Check if already following
    const existing = db.prepare(`
      SELECT * FROM user_follows
      WHERE follower_id = ? AND following_id = ?
    `).get(followerId, followingId)
    
    if (existing) {
      return res.status(400).json({ error: 'Already following this user' })
    }
    
    // Create follow relationship
    db.prepare(`
      INSERT INTO user_follows (follower_id, following_id)
      VALUES (?, ?)
    `).run(followerId, followingId)
    
    // Create notification
    createNotification(followingId, 'follow', followerId)
    
    // Check achievements for both users (follower gets following achievement, followed gets followers achievement)
    checkAchievements(db, followerId)
    checkAchievements(db, followingId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Follow error:', error)
    res.status(500).json({ error: 'Failed to follow user' })
  }
})

// Unfollow a user
router.post('/:userId/unfollow', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const followerId = req.user.id
    const followingId = parseInt(req.params.userId)
    
    db.prepare(`
      DELETE FROM user_follows
      WHERE follower_id = ? AND following_id = ?
    `).run(followerId, followingId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Unfollow error:', error)
    res.status(500).json({ error: 'Failed to unfollow user' })
  }
})

// Get followers of a user
router.get('/:userId/followers', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    const currentUserId = req.user?.id || null
    
    const followers = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        uf.created_at as followed_at,
        ${currentUserId ? `(SELECT COUNT(*) FROM user_follows WHERE follower_id = ? AND following_id = u.id) as is_following` : '0 as is_following'}
      FROM user_follows uf
      JOIN users u ON uf.follower_id = u.id
      WHERE uf.following_id = ?
      ORDER BY uf.created_at DESC
    `).all(currentUserId, userId)
    
    res.json(followers)
  } catch (error) {
    console.error('Get followers error:', error)
    res.status(500).json({ error: 'Failed to get followers' })
  }
})

// Get users that a user is following
router.get('/:userId/following', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    const currentUserId = req.user?.id || null
    
    const following = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        uf.created_at as followed_at,
        ${currentUserId ? `(SELECT COUNT(*) FROM user_follows WHERE follower_id = ? AND following_id = u.id) as is_following` : '0 as is_following'}
      FROM user_follows uf
      JOIN users u ON uf.following_id = u.id
      WHERE uf.follower_id = ?
      ORDER BY uf.created_at DESC
    `).all(currentUserId, userId)
    
    res.json(following)
  } catch (error) {
    console.error('Get following error:', error)
    res.status(500).json({ error: 'Failed to get following' })
  }
})

// Check if current user is following a user
router.get('/:userId/is-following', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const followerId = req.user.id
    const followingId = parseInt(req.params.userId)
    
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM user_follows
      WHERE follower_id = ? AND following_id = ?
    `).get(followerId, followingId)
    
    res.json({ isFollowing: result.count > 0 })
  } catch (error) {
    console.error('Check following error:', error)
    res.status(500).json({ error: 'Failed to check following status' })
  }
})

// Get follow stats for a user
router.get('/:userId/stats', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    
    const followersCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM user_follows
      WHERE following_id = ?
    `).get(userId)
    
    const followingCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM user_follows
      WHERE follower_id = ?
    `).get(userId)
    
    res.json({
      followers: followersCount.count || 0,
      following: followingCount.count || 0
    })
  } catch (error) {
    console.error('Get stats error:', error)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

export default router

