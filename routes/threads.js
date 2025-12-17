import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Create thread from message
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { channel_id, parent_message_id, name, type = 'public_thread', auto_archive_duration = 60 } = req.body

    if (!channel_id || !name) {
      return res.status(400).json({ error: 'Channel ID and thread name are required' })
    }

    // Check if channel exists
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id)
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' })
    }

    // Check if parent message exists (if provided)
    if (parent_message_id) {
      const parentMessage = db.prepare('SELECT * FROM channel_messages WHERE id = ?').get(parent_message_id)
      if (!parentMessage) {
        return res.status(404).json({ error: 'Parent message not found' })
      }
    }

    const result = db.prepare(`
      INSERT INTO threads (
        channel_id, parent_message_id, name, type, 
        auto_archive_duration, member_count, message_count, created_at
      )
      VALUES (?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP)
    `).run(channel_id, parent_message_id || null, name, type, auto_archive_duration)

    const threadId = result.lastInsertRowid

    // Add creator as thread member
    db.prepare(`
      INSERT INTO thread_members (thread_id, user_id, joined_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(threadId, userId)

    // Update message to reference thread
    if (parent_message_id) {
      db.prepare('UPDATE channel_messages SET thread_id = ? WHERE id = ?').run(threadId, parent_message_id)
    }

    const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId)
    res.status(201).json({ thread })
  } catch (error) {
    console.error('Create thread error:', error)
    res.status(500).json({ error: 'Failed to create thread' })
  }
})

// Get threads for a channel
router.get('/channel/:channelId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { channelId } = req.params
    const { archived = false } = req.query

    const threads = db.prepare(`
      SELECT 
        t.*,
        u.username as creator_username,
        u.avatar_url as creator_avatar
      FROM threads t
      LEFT JOIN channel_messages m ON t.parent_message_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE t.channel_id = ? AND t.archived = ?
      ORDER BY t.created_at DESC
    `).all(channelId, archived ? 1 : 0)

    res.json({ threads })
  } catch (error) {
    console.error('Get threads error:', error)
    res.status(500).json({ error: 'Failed to get threads' })
  }
})

// Get thread by ID
router.get('/:threadId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { threadId } = req.params

    const thread = db.prepare(`
      SELECT 
        t.*,
        c.name as channel_name,
        c.server_id
      FROM threads t
      JOIN channels c ON t.channel_id = c.id
      WHERE t.id = ?
    `).get(threadId)

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' })
    }

    res.json({ thread })
  } catch (error) {
    console.error('Get thread error:', error)
    res.status(500).json({ error: 'Failed to get thread' })
  }
})

// Get thread messages
router.get('/:threadId/messages', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { threadId } = req.params
    const { limit = 50, before } = req.query

    let query = `
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE m.thread_id = ?
    `
    const params = [threadId]

    if (before) {
      query += ' AND m.id < ?'
      params.push(before)
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?'
    params.push(parseInt(limit))

    const messages = db.prepare(query).all(...params)
    messages.reverse()

    res.json({ messages })
  } catch (error) {
    console.error('Get thread messages error:', error)
    res.status(500).json({ error: 'Failed to get thread messages' })
  }
})

// Join thread
router.post('/:threadId/join', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { threadId } = req.params
    const userId = req.user.id

    const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId)
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' })
    }

    // Check if already member
    const existing = db.prepare(`
      SELECT id FROM thread_members 
      WHERE thread_id = ? AND user_id = ?
    `).get(threadId, userId)

    if (existing) {
      return res.json({ success: true, message: 'Already a member' })
    }

    // Add member
    db.prepare(`
      INSERT INTO thread_members (thread_id, user_id, joined_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(threadId, userId)

    // Update member count
    db.prepare('UPDATE threads SET member_count = member_count + 1 WHERE id = ?').run(threadId)

    res.json({ success: true })
  } catch (error) {
    console.error('Join thread error:', error)
    res.status(500).json({ error: 'Failed to join thread' })
  }
})

// Leave thread
router.post('/:threadId/leave', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { threadId } = req.params
    const userId = req.user.id

    db.prepare(`
      DELETE FROM thread_members 
      WHERE thread_id = ? AND user_id = ?
    `).run(threadId, userId)

    // Update member count
    db.prepare('UPDATE threads SET member_count = member_count - 1 WHERE id = ?').run(threadId)

    res.json({ success: true })
  } catch (error) {
    console.error('Leave thread error:', error)
    res.status(500).json({ error: 'Failed to leave thread' })
  }
})

// Archive thread
router.post('/:threadId/archive', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { threadId } = req.params
    const userId = req.user.id

    // Check permissions (admin or thread creator)
    const thread = db.prepare(`
      SELECT t.*, c.server_id, s.owner_id
      FROM threads t
      JOIN channels c ON t.channel_id = c.id
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE t.id = ?
    `).get(threadId)

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' })
    }

    // Check if user is admin
    let isAdmin = false
    if (thread.server_id) {
      const member = db.prepare(`
        SELECT role FROM community_members 
        WHERE community_id = ? AND user_id = ?
      `).get(thread.server_id, userId)
      isAdmin = member?.role === 'admin' || thread.server_id && thread.owner_id === userId
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare(`
      UPDATE threads 
      SET archived = 1, archived_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(threadId)

    res.json({ success: true })
  } catch (error) {
    console.error('Archive thread error:', error)
    res.status(500).json({ error: 'Failed to archive thread' })
  }
})

export default router
