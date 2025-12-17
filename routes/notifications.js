import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get all notifications for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    const notifications = db.prepare(`
      SELECT 
        n.*,
        u.username as actor_username,
        u.avatar_url as actor_avatar_url,
        c.name as channel_name,
        s.name as server_name
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      LEFT JOIN channels c ON n.channel_id = c.id
      LEFT JOIN communities s ON n.server_id = s.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `).all(userId)
    
    res.json(notifications)
  } catch (error) {
    console.error('Get notifications error:', error)
    res.status(500).json({ error: 'Failed to get notifications' })
  }
})

// Get unread notification count
router.get('/unread', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    const count = db.prepare(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(userId)
    
    res.json({ count: count.count || 0 })
  } catch (error) {
    console.error('Get unread count error:', error)
    res.status(500).json({ error: 'Failed to get unread count' })
  }
})

// Mark notification as read
router.put('/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND user_id = ?
    `).run(req.params.notificationId, userId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Mark read error:', error)
    res.status(500).json({ error: 'Failed to mark as read' })
  }
})

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `).run(userId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Mark all read error:', error)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
})

// Store io instance (set from server.js)
let ioInstance = null

export function setIO(io) {
  ioInstance = io
}

// Helper function to create notification
export function createNotification(userId, type, actorId, options = {}) {
  try {
    const db = getDatabase()
    const { postId, commentId, messageId, content, channelId, serverId, isEveryone } = options
    
    const result = db.prepare(`
      INSERT INTO notifications (user_id, type, actor_id, post_id, comment_id, message_id, content, channel_id, server_id, is_everyone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, type, actorId, 
      postId || null, commentId || null, messageId || null, content || null,
      channelId || null, serverId || null, isEveryone || 0
    )

    // Get the created notification with actor info
    const notification = db.prepare(`
      SELECT 
        n.*,
        u.username as actor_username,
        u.avatar_url as actor_avatar_url
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.id = ?
    `).get(result.lastInsertRowid)

    // Emit real-time notification via socket.io
    if (ioInstance) {
      ioInstance.to(`user:${userId}`).emit('notification', notification)
    }

    return notification
  } catch (error) {
    console.error('Create notification error:', error)
    return null
  }
}

// Alias for emitNotification (used by friends.js and other routes)
// Signature: emitNotification(userId, { type, message, user_id, ... })
export function emitNotification(userId, notificationData) {
  const { type, actor_id, user_id, post_id, comment_id, message_id, content, message } = notificationData
  
  // Extract actor_id from notificationData (could be user_id or actor_id)
  const actorId = actor_id || user_id || null
  
  return createNotification(
    userId,  // recipient
    type,
    actorId,  // actor (who triggered the notification)
    {
      postId: post_id,
      commentId: comment_id,
      messageId: message_id,
      content: content || message
    }
  )
}

export default router

