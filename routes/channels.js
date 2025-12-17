import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get channels for a server
router.get('/server/:serverId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params

    const channels = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM channel_messages WHERE channel_id = c.id) as message_count
      FROM channels c
      WHERE c.server_id = ?
      ORDER BY c.position ASC, c.created_at ASC
    `).all(serverId)

    // Group by parent (categories)
    const categories = {}
    const topLevel = []

    for (const channel of channels) {
      if (channel.parent_id) {
        if (!categories[channel.parent_id]) {
          categories[channel.parent_id] = []
        }
        categories[channel.parent_id].push(channel)
      } else {
        topLevel.push(channel)
      }
    }

    res.json({ channels: topLevel, categories })
  } catch (error) {
    console.error('Get channels error:', error)
    res.status(500).json({ error: 'Failed to get channels' })
  }
})

// Get channel by ID
router.get('/:channelId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { channelId } = req.params

    const channel = db.prepare(`
      SELECT 
        c.*,
        s.name as server_name,
        s.icon as server_icon
      FROM channels c
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE c.id = ?
    `).get(channelId)

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' })
    }

    res.json({ channel })
  } catch (error) {
    console.error('Get channel error:', error)
    res.status(500).json({ error: 'Failed to get channel' })
  }
})

// Create channel
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { 
      server_id, 
      name, 
      type = 'text', 
      topic, 
      parent_id, 
      nsfw = 0,
      bitrate,
      user_limit,
      rate_limit_per_user = 0
    } = req.body

    if (!server_id || !name) {
      return res.status(400).json({ error: 'Server ID and channel name are required' })
    }

    // Check permissions (user must be admin or owner)
    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(server_id)
    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(server_id, userId)

    if (server.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Get max position
    const maxPos = db.prepare(`
      SELECT COALESCE(MAX(position), -1) + 1 as next_pos
      FROM channels 
      WHERE server_id = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
    `).get(server_id, parent_id || null, parent_id || null)

    const result = db.prepare(`
      INSERT INTO channels (
        server_id, name, type, position, topic, parent_id, 
        nsfw, bitrate, user_limit, rate_limit_per_user, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      server_id, name, type, maxPos.next_pos, topic || null, 
      parent_id || null, nsfw, bitrate || null, user_limit || null, rate_limit_per_user
    )

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ channel })
  } catch (error) {
    console.error('Create channel error:', error)
    res.status(500).json({ error: 'Failed to create channel' })
  }
})

// Update channel
router.put('/:channelId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { channelId } = req.params
    const userId = req.user.id
    const { name, topic, position, nsfw, bitrate, user_limit, rate_limit_per_user } = req.body

    // Get channel and check permissions
    const channel = db.prepare(`
      SELECT c.*, s.owner_id 
      FROM channels c
      JOIN communities s ON c.server_id = s.id
      WHERE c.id = ?
    `).get(channelId)

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' })
    }

    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(channel.server_id, userId)

    if (channel.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const updates = []
    const params = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (topic !== undefined) {
      updates.push('topic = ?')
      params.push(topic)
    }
    if (position !== undefined) {
      updates.push('position = ?')
      params.push(position)
    }
    if (nsfw !== undefined) {
      updates.push('nsfw = ?')
      params.push(nsfw)
    }
    if (bitrate !== undefined) {
      updates.push('bitrate = ?')
      params.push(bitrate)
    }
    if (user_limit !== undefined) {
      updates.push('user_limit = ?')
      params.push(user_limit)
    }
    if (rate_limit_per_user !== undefined) {
      updates.push('rate_limit_per_user = ?')
      params.push(rate_limit_per_user)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(channelId)

    db.prepare(`
      UPDATE channels 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)

    const updatedChannel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId)
    res.json({ channel: updatedChannel })
  } catch (error) {
    console.error('Update channel error:', error)
    res.status(500).json({ error: 'Failed to update channel' })
  }
})

// Delete channel
router.delete('/:channelId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { channelId } = req.params
    const userId = req.user.id

    // Get channel and check permissions
    const channel = db.prepare(`
      SELECT c.*, s.owner_id 
      FROM channels c
      JOIN communities s ON c.server_id = s.id
      WHERE c.id = ?
    `).get(channelId)

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' })
    }

    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(channel.server_id, userId)

    if (channel.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare('DELETE FROM channels WHERE id = ?').run(channelId)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete channel error:', error)
    res.status(500).json({ error: 'Failed to delete channel' })
  }
})

export default router
