import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Get user's group DMs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id

    const groupDms = db.prepare(`
      SELECT 
        gd.*,
        (SELECT COUNT(*) FROM group_dm_members WHERE group_dm_id = gd.id) as member_count,
        (SELECT COUNT(*) FROM group_dm_messages WHERE group_dm_id = gd.id) as message_count
      FROM group_dms gd
      JOIN group_dm_members gdm ON gd.id = gdm.group_dm_id
      WHERE gdm.user_id = ?
      ORDER BY gd.updated_at DESC
    `).all(userId)

    res.json({ group_dms: groupDms })
  } catch (error) {
    console.error('Get group DMs error:', error)
    res.status(500).json({ error: 'Failed to get group DMs' })
  }
})

// Get group DM by ID
router.get('/:groupId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { groupId } = req.params
    const userId = req.user.id

    // Check if user is member
    const member = db.prepare(`
      SELECT * FROM group_dm_members 
      WHERE group_dm_id = ? AND user_id = ?
    `).get(groupId, userId)

    if (!member) {
      return res.status(403).json({ error: 'Not a member of this group DM' })
    }

    const groupDm = db.prepare('SELECT * FROM group_dms WHERE id = ?').get(groupId)
    if (!groupDm) {
      return res.status(404).json({ error: 'Group DM not found' })
    }

    // Get members
    const members = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        up.display_name,
        gdm.joined_at
      FROM group_dm_members gdm
      JOIN users u ON gdm.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE gdm.group_dm_id = ?
      ORDER BY gdm.joined_at ASC
    `).all(groupId)

    res.json({ group_dm: { ...groupDm, members } })
  } catch (error) {
    console.error('Get group DM error:', error)
    res.status(500).json({ error: 'Failed to get group DM' })
  }
})

// Create group DM
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { name, icon, user_ids } = req.body

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length < 1) {
      return res.status(400).json({ error: 'At least one user ID is required' })
    }

    // Create group DM
    const result = db.prepare(`
      INSERT INTO group_dms (name, icon, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(name || null, icon || null, userId)

    const groupId = result.lastInsertRowid

    // Add owner as member
    db.prepare(`
      INSERT INTO group_dm_members (group_dm_id, user_id, joined_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(groupId, userId)

    // Add other members
    for (const memberId of user_ids) {
      if (memberId !== userId) {
        db.prepare(`
          INSERT INTO group_dm_members (group_dm_id, user_id, joined_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
        `).run(groupId, memberId)
      }
    }

    const groupDm = db.prepare('SELECT * FROM group_dms WHERE id = ?').get(groupId)
    res.status(201).json({ group_dm: groupDm })
  } catch (error) {
    console.error('Create group DM error:', error)
    res.status(500).json({ error: 'Failed to create group DM' })
  }
})

// Update group DM
router.put('/:groupId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { groupId } = req.params
    const userId = req.user.id
    const { name, icon } = req.body

    // Check if user is owner
    const groupDm = db.prepare('SELECT * FROM group_dms WHERE id = ?').get(groupId)
    if (!groupDm) {
      return res.status(404).json({ error: 'Group DM not found' })
    }

    if (groupDm.owner_id !== userId) {
      return res.status(403).json({ error: 'Only owner can update group DM' })
    }

    const updates = []
    const params = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (icon !== undefined) {
      updates.push('icon = ?')
      params.push(icon)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(groupId)

    db.prepare(`
      UPDATE group_dms 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)

    const updatedGroupDm = db.prepare('SELECT * FROM group_dms WHERE id = ?').get(groupId)
    res.json({ group_dm: updatedGroupDm })
  } catch (error) {
    console.error('Update group DM error:', error)
    res.status(500).json({ error: 'Failed to update group DM' })
  }
})

// Add member to group DM
router.post('/:groupId/members/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { groupId, userId: newMemberId } = req.params
    const userId = req.user.id

    // Check if user is owner or member
    const groupDm = db.prepare('SELECT owner_id FROM group_dms WHERE id = ?').get(groupId)
    if (!groupDm) {
      return res.status(404).json({ error: 'Group DM not found' })
    }

    const member = db.prepare(`
      SELECT * FROM group_dm_members 
      WHERE group_dm_id = ? AND user_id = ?
    `).get(groupId, userId)

    if (groupDm.owner_id !== userId && !member) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Check if already member
    const existing = db.prepare(`
      SELECT id FROM group_dm_members 
      WHERE group_dm_id = ? AND user_id = ?
    `).get(groupId, newMemberId)

    if (existing) {
      return res.json({ success: true, message: 'Already a member' })
    }

    db.prepare(`
      INSERT INTO group_dm_members (group_dm_id, user_id, joined_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(groupId, newMemberId)

    res.json({ success: true })
  } catch (error) {
    console.error('Add member error:', error)
    res.status(500).json({ error: 'Failed to add member' })
  }
})

// Remove member from group DM
router.delete('/:groupId/members/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { groupId, userId: removeUserId } = req.params
    const userId = req.user.id

    const groupDm = db.prepare('SELECT owner_id FROM group_dms WHERE id = ?').get(groupId)
    if (!groupDm) {
      return res.status(404).json({ error: 'Group DM not found' })
    }

    // Only owner can remove members (or user can leave themselves)
    if (groupDm.owner_id !== userId && removeUserId !== userId) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare(`
      DELETE FROM group_dm_members 
      WHERE group_dm_id = ? AND user_id = ?
    `).run(groupId, removeUserId)

    res.json({ success: true })
  } catch (error) {
    console.error('Remove member error:', error)
    res.status(500).json({ error: 'Failed to remove member' })
  }
})

// Get group DM messages
router.get('/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { groupId } = req.params
    const userId = req.user.id
    const { limit = 50, before } = req.query

    // Check if user is member
    const member = db.prepare(`
      SELECT * FROM group_dm_members 
      WHERE group_dm_id = ? AND user_id = ?
    `).get(groupId, userId)

    if (!member) {
      return res.status(403).json({ error: 'Not a member of this group DM' })
    }

    let query = `
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name
      FROM group_dm_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE m.group_dm_id = ?
    `
    const params = [groupId]

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
    console.error('Get group DM messages error:', error)
    res.status(500).json({ error: 'Failed to get messages' })
  }
})

// Send message to group DM
router.post('/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { groupId } = req.params
    const userId = req.user.id
    const { content, attachments, embeds } = req.body

    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message content or attachments required' })
    }

    // Check if user is member
    const member = db.prepare(`
      SELECT * FROM group_dm_members 
      WHERE group_dm_id = ? AND user_id = ?
    `).get(groupId, userId)

    if (!member) {
      return res.status(403).json({ error: 'Not a member of this group DM' })
    }

    const result = db.prepare(`
      INSERT INTO group_dm_messages (
        group_dm_id, user_id, content, attachments, embeds, mentions,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      groupId, userId, content || null,
      attachments ? JSON.stringify(attachments) : null,
      embeds ? JSON.stringify(embeds) : null,
      null // Mentions can be parsed here
    )

    const messageId = result.lastInsertRowid

    // Update group DM updated_at
    db.prepare('UPDATE group_dms SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(groupId)

    const message = db.prepare(`
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name
      FROM group_dm_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE m.id = ?
    `).get(messageId)

    res.status(201).json({ message })
  } catch (error) {
    console.error('Send group DM message error:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

export default router
