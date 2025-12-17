import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import crypto from 'crypto'

const router = express.Router()

// Generate unique invite code
function generateInviteCode() {
  return crypto.randomBytes(8).toString('base64url').substring(0, 10).toUpperCase()
}

// Create invite link
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { server_id, max_uses, expires_in } = req.body

    if (!server_id) {
      return res.status(400).json({ error: 'Server ID is required' })
    }

    // Check if user has permission (owner or admin)
    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(server_id)
    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    if (server.owner_id !== userId) {
      return res.status(403).json({ error: 'Only server owner can create invites' })
    }

    const code = generateInviteCode()
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null

    const result = db.prepare(`
      INSERT INTO server_invites (
        server_id, code, created_by, max_uses, uses, expires_at, created_at
      )
      VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
    `).run(
      server_id,
      code,
      userId,
      max_uses || null,
      expiresAt
    )

    const invite = db.prepare(`
      SELECT i.*, c.name as server_name, u.username as created_by_username
      FROM server_invites i
      JOIN communities c ON i.server_id = c.id
      JOIN users u ON i.created_by = u.id
      WHERE i.id = ?
    `).get(result.lastInsertRowid)

    res.status(201).json({ invite })
  } catch (error) {
    console.error('Create invite error:', error)
    res.status(500).json({ error: 'Failed to create invite' })
  }
})

// Get invite by code
router.get('/:code', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { code } = req.params

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Invalid invite code' })
    }

    // First check if invite exists
    const invite = db.prepare(`
      SELECT i.*, 
        c.name as server_name, 
        COALESCE(c.server_icon, c.icon) as server_icon, 
        COALESCE(u.username, 'Unknown') as created_by_username
      FROM server_invites i
      JOIN communities c ON i.server_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.code = ?
    `).get(code.toUpperCase())

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' })
    }

    // Check if expired
    if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at)
      const now = new Date()
      if (expiresAt <= now) {
        return res.status(410).json({ error: 'Invite has expired' })
      }
    }

    // Check if max uses reached
    if (invite.max_uses && invite.uses >= invite.max_uses) {
      return res.status(410).json({ error: 'Invite has reached maximum uses' })
    }

    res.json({ invite })
  } catch (error) {
    console.error('Get invite error:', error)
    console.error('Error details:', error.message, error.stack)
    res.status(500).json({ error: 'Failed to get invite', details: error.message })
  }
})

// Accept invite (join server)
router.post('/:code/accept', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { code } = req.params

    const invite = db.prepare(`
      SELECT i.*, c.id as server_id, c.name as server_name
      FROM server_invites i
      JOIN communities c ON i.server_id = c.id
      WHERE i.code = ? AND (i.expires_at IS NULL OR i.expires_at > datetime('now'))
    `).get(code)

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or expired' })
    }

    // Check if max uses reached
    if (invite.max_uses && invite.uses >= invite.max_uses) {
      return res.status(410).json({ error: 'Invite has reached maximum uses' })
    }

    // Check if user is already a member
    const existingMember = db.prepare(`
      SELECT id FROM community_members
      WHERE community_id = ? AND user_id = ?
    `).get(invite.server_id, userId)

    if (existingMember) {
      return res.json({ 
        success: true, 
        already_member: true,
        server: { id: invite.server_id, name: invite.server_name } 
      })
    }

    // Add user to server as member
    db.prepare(`
      INSERT INTO community_members (community_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', CURRENT_TIMESTAMP)
    `).run(invite.server_id, userId)

    // Increment invite uses
    db.prepare(`
      UPDATE server_invites
      SET uses = uses + 1
      WHERE id = ?
    `).run(invite.id)

    res.json({ 
      success: true, 
      server: { id: invite.server_id, name: invite.server_name } 
    })
  } catch (error) {
    console.error('Accept invite error:', error)
    res.status(500).json({ error: 'Failed to accept invite' })
  }
})

// Get all invites for a server
router.get('/server/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { serverId } = req.params

    // Check if user has permission
    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(serverId)
    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    if (server.owner_id !== userId) {
      return res.status(403).json({ error: 'Only server owner can view invites' })
    }

    const invites = db.prepare(`
      SELECT i.*, u.username as created_by_username
      FROM server_invites i
      JOIN users u ON i.created_by = u.id
      WHERE i.server_id = ?
      ORDER BY i.created_at DESC
    `).all(serverId)

    res.json({ invites })
  } catch (error) {
    console.error('Get server invites error:', error)
    res.status(500).json({ error: 'Failed to get invites' })
  }
})

// Delete invite
router.delete('/:inviteId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { inviteId } = req.params

    const invite = db.prepare('SELECT * FROM server_invites WHERE id = ?').get(inviteId)
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' })
    }

    // Check permission
    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(invite.server_id)
    if (server.owner_id !== userId) {
      return res.status(403).json({ error: 'Only server owner can delete invites' })
    }

    db.prepare('DELETE FROM server_invites WHERE id = ?').run(inviteId)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete invite error:', error)
    res.status(500).json({ error: 'Failed to delete invite' })
  }
})

export default router
