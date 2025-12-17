import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'
import { emitNotification } from './notifications.js'

const router = express.Router()

// Get friends list
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { status = 'accepted' } = req.query

    const friendships = db.prepare(`
      SELECT 
        f.*,
        u.id as friend_user_id,
        u.username as friend_username,
        u.avatar_url as friend_avatar,
        up.display_name as friend_display_name,
        uas.status as friend_status,
        uas.game_name as friend_game,
        uas.custom_status as friend_custom_status
      FROM friendships f
      JOIN users u ON (
        CASE 
          WHEN f.user_id = ? THEN f.friend_id
          ELSE f.user_id
        END = u.id
      )
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE (f.user_id = ? OR f.friend_id = ?)
        AND f.status = ?
      ORDER BY f.updated_at DESC
    `).all(userId, userId, userId, status)

    res.json({ friendships })
  } catch (error) {
    console.error('Get friends error:', error)
    res.status(500).json({ error: 'Failed to get friends' })
  }
})

// Send friend request by username
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { username } = req.body

    if (!username) {
      return res.status(400).json({ error: 'Username is required' })
    }

    // Find user by username
    const friend = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username)
    if (!friend) {
      return res.status(404).json({ error: 'User not found' })
    }

    const friendId = friend.id

    if (userId === friendId) {
      return res.status(400).json({ error: 'Cannot friend yourself' })
    }

    // Check if already friends or request exists
    const existing = db.prepare(`
      SELECT * FROM friendships 
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(userId, friendId, friendId, userId)

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends' })
      }
      if (existing.status === 'pending' && existing.user_id === userId) {
        return res.status(400).json({ error: 'Friend request already sent' })
      }
      if (existing.status === 'pending' && existing.friend_id === userId) {
        // Accept the request
        db.prepare(`
          UPDATE friendships 
          SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id)

        // Send notification
        emitNotification(friendId, {
          type: 'friend_request_accepted',
          message: `${req.user.username} accepted your friend request`,
          user_id: userId
        })

        return res.json({ success: true, message: 'Friend request accepted' })
      }
      if (existing.status === 'blocked') {
        return res.status(400).json({ error: 'Cannot send friend request to blocked user' })
      }
    }

    // Create friend request
    db.prepare(`
      INSERT INTO friendships (user_id, friend_id, status, created_at, updated_at)
      VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(userId, friendId)

    // Send notification
    emitNotification(friendId, {
      type: 'friend_request',
      message: `${req.user.username} sent you a friend request`,
      user_id: userId
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Send friend request error:', error)
    res.status(500).json({ error: 'Failed to send friend request' })
  }
})

// Send friend request by user ID (legacy endpoint)
router.post('/request/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { userId: friendId } = req.params

    if (userId === parseInt(friendId)) {
      return res.status(400).json({ error: 'Cannot friend yourself' })
    }

    // Check if user exists
    const friend = db.prepare('SELECT id, username FROM users WHERE id = ?').get(friendId)
    if (!friend) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if already friends or request exists
    const existing = db.prepare(`
      SELECT * FROM friendships 
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(userId, friendId, friendId, userId)

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends' })
      }
      if (existing.status === 'pending' && existing.user_id === userId) {
        return res.status(400).json({ error: 'Friend request already sent' })
      }
      if (existing.status === 'pending' && existing.friend_id === userId) {
        // Accept the request
        db.prepare(`
          UPDATE friendships 
          SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id)

        // Send notification
        emitNotification(friendId, {
          type: 'friend_request_accepted',
          message: `${req.user.username} accepted your friend request`,
          user_id: userId
        })

        return res.json({ success: true, message: 'Friend request accepted' })
      }
      if (existing.status === 'blocked') {
        return res.status(400).json({ error: 'Cannot send friend request to blocked user' })
      }
    }

    // Create friend request
    db.prepare(`
      INSERT INTO friendships (user_id, friend_id, status, created_at, updated_at)
      VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(userId, friendId)

    // Send notification
    emitNotification(friendId, {
      type: 'friend_request',
      message: `${req.user.username} sent you a friend request`,
      user_id: userId
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Send friend request error:', error)
    res.status(500).json({ error: 'Failed to send friend request' })
  }
})

// Accept friend request
router.post('/accept/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { userId: friendId } = req.params

    const friendship = db.prepare(`
      SELECT * FROM friendships 
      WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    `).get(friendId, userId)

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' })
    }

    db.prepare(`
      UPDATE friendships 
      SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(friendship.id)

    // Send notification
    const friend = db.prepare('SELECT username FROM users WHERE id = ?').get(friendId)
    emitNotification(friendId, {
      type: 'friend_request_accepted',
      message: `${req.user.username} accepted your friend request`,
      user_id: userId
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Accept friend request error:', error)
    res.status(500).json({ error: 'Failed to accept friend request' })
  }
})

// Reject/Remove friend
router.delete('/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { userId: friendId } = req.params

    db.prepare(`
      DELETE FROM friendships 
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).run(userId, friendId, friendId, userId)

    res.json({ success: true })
  } catch (error) {
    console.error('Remove friend error:', error)
    res.status(500).json({ error: 'Failed to remove friend' })
  }
})

// Block user
router.post('/block/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { userId: blockUserId } = req.params

    if (userId === parseInt(blockUserId)) {
      return res.status(400).json({ error: 'Cannot block yourself' })
    }

    // Update or create friendship with blocked status
    const existing = db.prepare(`
      SELECT * FROM friendships 
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(userId, blockUserId, blockUserId, userId)

    if (existing) {
      db.prepare(`
        UPDATE friendships 
        SET status = 'blocked', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(existing.id)
    } else {
      db.prepare(`
        INSERT INTO friendships (user_id, friend_id, status, created_at, updated_at)
        VALUES (?, ?, 'blocked', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(userId, blockUserId)
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Block user error:', error)
    res.status(500).json({ error: 'Failed to block user' })
  }
})

// Unblock user
router.post('/unblock/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { userId: unblockUserId } = req.params

    db.prepare(`
      DELETE FROM friendships 
      WHERE user_id = ? AND friend_id = ? AND status = 'blocked'
    `).run(userId, unblockUserId)

    res.json({ success: true })
  } catch (error) {
    console.error('Unblock user error:', error)
    res.status(500).json({ error: 'Failed to unblock user' })
  }
})

export default router
