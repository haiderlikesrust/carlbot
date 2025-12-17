import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Get conversations (for DMs page)
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id

    const conversations = db.prepare(`
      SELECT DISTINCT
        CASE 
          WHEN dm.sender_id = ? THEN dm.recipient_id
          ELSE dm.sender_id
        END as other_user_id,
        u.username as other_username,
        u.avatar_url as other_avatar_url,
        up.display_name as other_display_name,
        (SELECT content FROM direct_messages 
         WHERE (sender_id = ? AND recipient_id = other_user_id) 
            OR (sender_id = other_user_id AND recipient_id = ?)
         ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM direct_messages 
         WHERE (sender_id = ? AND recipient_id = other_user_id) 
            OR (sender_id = other_user_id AND recipient_id = ?)
         ORDER BY created_at DESC LIMIT 1) as last_message_time
      FROM direct_messages dm
      JOIN users u ON (
        CASE 
          WHEN dm.sender_id = ? THEN dm.recipient_id
          ELSE dm.sender_id
        END = u.id
      )
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE dm.sender_id = ? OR dm.recipient_id = ?
      ORDER BY last_message_time DESC
    `).all(userId, userId, userId, userId, userId, userId, userId)

    res.json(conversations)
  } catch (error) {
    console.error('Get conversations error:', error)
    res.status(500).json({ error: 'Failed to get conversations' })
  }
})

// Get messages with a user
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { userId: otherUserId } = req.params

    const messages = db.prepare(`
      SELECT 
        dm.*,
        u.username as sender_username,
        u.avatar_url as sender_avatar_url
      FROM direct_messages dm
      JOIN users u ON dm.sender_id = u.id
      WHERE (dm.sender_id = ? AND dm.recipient_id = ?)
         OR (dm.sender_id = ? AND dm.recipient_id = ?)
      ORDER BY dm.created_at ASC
    `).all(userId, otherUserId, otherUserId, userId)

    res.json({ messages })
  } catch (error) {
    console.error('Get messages error:', error)
    res.status(500).json({ error: 'Failed to get messages' })
  }
})

// Send direct message
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { recipient_id, content } = req.body

    if (!recipient_id || !content) {
      return res.status(400).json({ error: 'Recipient ID and content are required' })
    }

    const result = db.prepare(`
      INSERT INTO direct_messages (sender_id, recipient_id, content, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, recipient_id, content)

    const message = db.prepare(`
      SELECT 
        dm.*,
        u.username as sender_username,
        u.avatar_url as sender_avatar_url
      FROM direct_messages dm
      JOIN users u ON dm.sender_id = u.id
      WHERE dm.id = ?
    `).get(result.lastInsertRowid)

    res.status(201).json({ message })
  } catch (error) {
    console.error('Send message error:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

export default router
