import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get all servers user is member of
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id

    const servers = db.prepare(`
      SELECT 
        c.*,
        cm.role as member_role,
        cm.joined_at,
        (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
        (SELECT COUNT(*) FROM channels WHERE server_id = c.id) as channel_count
      FROM communities c
      JOIN community_members cm ON c.id = cm.community_id
      WHERE cm.user_id = ?
      ORDER BY c.name ASC
    `).all(userId)

    res.json({ servers })
  } catch (error) {
    console.error('Get servers error:', error)
    res.status(500).json({ error: 'Failed to get servers' })
  }
})

// Get server by ID
router.get('/:serverId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user?.id

    const server = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
        (SELECT COUNT(*) FROM channels WHERE server_id = c.id) as channel_count
      FROM communities c
      WHERE c.id = ?
    `).get(serverId)

    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    // Check if user is member (if authenticated)
    let memberRole = null
    if (userId) {
      const member = db.prepare(`
        SELECT role FROM community_members 
        WHERE community_id = ? AND user_id = ?
      `).get(serverId, userId)
      memberRole = member?.role || null
    }

    res.json({ 
      server: {
        ...server, 
        member_role: memberRole,
        is_member: !!memberRole
      }
    })
  } catch (error) {
    console.error('Get server error:', error)
    res.status(500).json({ error: 'Failed to get server' })
  }
})

// Create server
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { name, description, icon, server_type = 'community' } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Server name is required' })
    }

    // Check for duplicate server name under same owner
    const existing = db.prepare(`
      SELECT id FROM communities 
      WHERE owner_id = ? AND name = ?
    `).get(userId, name)

    if (existing) {
      return res.status(400).json({ error: 'You already have a server with this name' })
    }

    // Generate slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const result = db.prepare(`
      INSERT INTO communities (
        name, slug, description, icon, owner_id, server_type, 
        is_public, member_count, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(name, slug, description || null, icon || null, userId, server_type)

    const serverId = result.lastInsertRowid

    // Add owner as admin member
    db.prepare(`
      INSERT INTO community_members (community_id, user_id, role, joined_at)
      VALUES (?, ?, 'admin', CURRENT_TIMESTAMP)
    `).run(serverId, userId)

    // Create default channels
    const defaultChannels = [
      { name: 'general', type: 'text', position: 0 },
      { name: 'voice', type: 'voice', position: 1 }
    ]

    for (const channel of defaultChannels) {
      db.prepare(`
        INSERT INTO channels (server_id, name, type, position, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(serverId, channel.name, channel.type, channel.position)
    }

    const server = db.prepare(`
      SELECT * FROM communities WHERE id = ?
    `).get(serverId)

    res.status(201).json({ server })
  } catch (error) {
    console.error('Create server error:', error)
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Server name already exists' })
    }
    res.status(500).json({ error: 'Failed to create server' })
  }
})

// Update server
router.put('/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id
    const { name, description, icon, server_banner, server_type, verification_level } = req.body

    // Check if user is owner or admin
    const server = db.prepare(`
      SELECT owner_id FROM communities WHERE id = ?
    `).get(serverId)

    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(serverId, userId)

    if (server.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const updates = []
    const params = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (description !== undefined) {
      updates.push('description = ?')
      params.push(description)
    }
    if (icon !== undefined) {
      updates.push('icon = ?')
      params.push(icon)
    }
    if (server_banner !== undefined) {
      updates.push('server_banner = ?')
      params.push(server_banner)
    }
    if (server_type !== undefined) {
      updates.push('server_type = ?')
      params.push(server_type)
    }
    if (verification_level !== undefined) {
      updates.push('verification_level = ?')
      params.push(verification_level)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(serverId)

    db.prepare(`
      UPDATE communities 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)

    const updatedServer = db.prepare('SELECT * FROM communities WHERE id = ?').get(serverId)
    res.json({ server: updatedServer })
  } catch (error) {
    console.error('Update server error:', error)
    res.status(500).json({ error: 'Failed to update server' })
  }
})

// Delete server
router.delete('/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id

    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(serverId)

    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    if (server.owner_id !== userId) {
      return res.status(403).json({ error: 'Only server owner can delete server' })
    }

    db.prepare('DELETE FROM communities WHERE id = ?').run(serverId)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete server error:', error)
    res.status(500).json({ error: 'Failed to delete server' })
  }
})

// Join server
router.post('/:serverId/join', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id

    // Check if server exists
    const server = db.prepare('SELECT * FROM communities WHERE id = ?').get(serverId)
    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    // Check if already member
    const existing = db.prepare(`
      SELECT id FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(serverId, userId)

    if (existing) {
      return res.json({ success: true, message: 'Already a member' })
    }

    // Add member
    db.prepare(`
      INSERT INTO community_members (community_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', CURRENT_TIMESTAMP)
    `).run(serverId, userId)

    // Update member count
    db.prepare(`
      UPDATE communities 
      SET member_count = member_count + 1 
      WHERE id = ?
    `).run(serverId)

    res.json({ success: true })
  } catch (error) {
    console.error('Join server error:', error)
    res.status(500).json({ error: 'Failed to join server' })
  }
})

// Get server members
router.get('/:serverId/members', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id

    // Check if user is member
    const memberCheck = db.prepare(`
      SELECT id FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(serverId, userId)

    if (!memberCheck) {
      return res.status(403).json({ error: 'You must be a member to view members' })
    }

    const members = db.prepare(`
      SELECT 
        cm.*,
        u.username,
        u.avatar_url,
        up.display_name
      FROM community_members cm
      JOIN users u ON cm.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE cm.community_id = ?
      ORDER BY 
        CASE cm.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'moderator' THEN 3
          ELSE 4
        END,
        cm.joined_at ASC
    `).all(serverId)

    // Convert avatar URLs
    members.forEach(member => {
      if (member.avatar_url && !member.avatar_url.startsWith('http')) {
        const baseUrl = process.env.CLIENT_URL?.replace(':5173', ':3000') || 'http://localhost:3000'
        member.avatar_url = `${baseUrl}${member.avatar_url.startsWith('/') ? '' : '/'}${member.avatar_url}`
      }
    })

    res.json({ members })
  } catch (error) {
    console.error('Get members error:', error)
    res.status(500).json({ error: 'Failed to get members' })
  }
})

// Leave server
router.post('/:serverId/leave', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id

    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(serverId)
    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    if (server.owner_id === userId) {
      return res.status(400).json({ error: 'Server owner cannot leave server' })
    }

    db.prepare(`
      DELETE FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).run(serverId, userId)

    // Update member count
    db.prepare(`
      UPDATE communities 
      SET member_count = member_count - 1 
      WHERE id = ?
    `).run(serverId)

    res.json({ success: true })
  } catch (error) {
    console.error('Leave server error:', error)
    res.status(500).json({ error: 'Failed to leave server' })
  }
})

// Get server members
router.get('/:serverId/members', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const { limit = 100, offset = 0 } = req.query

    const members = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        up.display_name,
        cm.role,
        cm.joined_at,
        uas.status as activity_status,
        uas.game_name,
        uas.custom_status
      FROM community_members cm
      JOIN users u ON cm.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE cm.community_id = ?
      ORDER BY 
        CASE cm.role 
          WHEN 'admin' THEN 1
          WHEN 'moderator' THEN 2
          ELSE 3
        END,
        cm.joined_at ASC
      LIMIT ? OFFSET ?
    `).all(serverId, parseInt(limit), parseInt(offset))

    res.json({ members })
  } catch (error) {
    console.error('Get members error:', error)
    res.status(500).json({ error: 'Failed to get members' })
  }
})

export default router
