import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Permission flags (Discord-like)
const PERMISSIONS = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  VIEW_GUILD_INSIGHTS: 1n << 19n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EMOJIS_AND_STICKERS: 1n << 30n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  REQUEST_TO_SPEAK: 1n << 32n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  USE_EXTERNAL_STICKERS: 1n << 37n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  USE_EMBEDDED_ACTIVITIES: 1n << 39n,
  MODERATE_MEMBERS: 1n << 40n
}

// Helper to check permissions
export function hasPermission(userPermissions, permission) {
  if (!userPermissions) return false
  const perms = BigInt(userPermissions)
  return (perms & permission) === permission || (perms & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR
}

// Get roles for a server
router.get('/server/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params

    const roles = db.prepare(`
      SELECT * FROM server_roles
      WHERE server_id = ?
      ORDER BY position DESC, created_at ASC
    `).all(serverId)

    res.json({ roles })
  } catch (error) {
    console.error('Get roles error:', error)
    res.status(500).json({ error: 'Failed to get roles' })
  }
})

// Create role
router.post('/server/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id
    const { name, color, hoist, mentionable, permissions, icon, unicode_emoji } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' })
    }

    // Check if user has MANAGE_ROLES permission
    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(serverId)
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

    // Get max position
    const maxPos = db.prepare(`
      SELECT COALESCE(MAX(position), -1) + 1 as next_pos
      FROM server_roles WHERE server_id = ?
    `).get(serverId)

    // Default permissions (view channel, send messages, read history)
    const defaultPerms = {
      VIEW_CHANNEL: true,
      SEND_MESSAGES: true,
      READ_MESSAGE_HISTORY: true,
      ADD_REACTIONS: true
    }
    const finalPermissions = permissions ? JSON.stringify(permissions) : JSON.stringify(defaultPerms)

    const result = db.prepare(`
      INSERT INTO server_roles (
        server_id, name, color, hoist, mentionable, position,
        permissions, icon, unicode_emoji, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      serverId, name, color || '#000000', hoist ? 1 : 0, mentionable ? 1 : 0,
      maxPos.next_pos, finalPermissions, icon || null, unicode_emoji || null
    )

    const role = db.prepare('SELECT * FROM server_roles WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ role })
  } catch (error) {
    console.error('Create role error:', error)
    res.status(500).json({ error: 'Failed to create role' })
  }
})

// Update role
router.put('/:roleId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { roleId } = req.params
    const userId = req.user.id
    const { name, color, hoist, mentionable, position, permissions, icon, unicode_emoji } = req.body

    const role = db.prepare(`
      SELECT r.*, s.owner_id 
      FROM server_roles r
      JOIN communities s ON r.server_id = s.id
      WHERE r.id = ?
    `).get(roleId)

    if (!role) {
      return res.status(404).json({ error: 'Role not found' })
    }

    // Check permissions
    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(role.server_id, userId)

    if (role.server_id && role.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const updates = []
    const params = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (color !== undefined) {
      updates.push('color = ?')
      params.push(color)
    }
    if (hoist !== undefined) {
      updates.push('hoist = ?')
      params.push(hoist ? 1 : 0)
    }
    if (mentionable !== undefined) {
      updates.push('mentionable = ?')
      params.push(mentionable ? 1 : 0)
    }
    if (position !== undefined) {
      updates.push('position = ?')
      params.push(position)
    }
    if (permissions !== undefined) {
      updates.push('permissions = ?')
      params.push(JSON.stringify(permissions))
    }
    if (icon !== undefined) {
      updates.push('icon = ?')
      params.push(icon)
    }
    if (unicode_emoji !== undefined) {
      updates.push('unicode_emoji = ?')
      params.push(unicode_emoji)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(roleId)

    db.prepare(`
      UPDATE server_roles 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)

    const updatedRole = db.prepare('SELECT * FROM server_roles WHERE id = ?').get(roleId)
    res.json({ role: updatedRole })
  } catch (error) {
    console.error('Update role error:', error)
    res.status(500).json({ error: 'Failed to update role' })
  }
})

// Delete role
router.delete('/:roleId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { roleId } = req.params
    const userId = req.user.id

    const role = db.prepare(`
      SELECT r.*, s.owner_id 
      FROM server_roles r
      JOIN communities s ON r.server_id = s.id
      WHERE r.id = ?
    `).get(roleId)

    if (!role) {
      return res.status(404).json({ error: 'Role not found' })
    }

    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(role.server_id, userId)

    if (role.server_id && role.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare('DELETE FROM server_roles WHERE id = ?').run(roleId)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete role error:', error)
    res.status(500).json({ error: 'Failed to delete role' })
  }
})

// Assign role to user
router.post('/:roleId/assign/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { roleId, userId: targetUserId } = req.params
    const userId = req.user.id

    const role = db.prepare(`
      SELECT r.*, s.owner_id 
      FROM server_roles r
      JOIN communities s ON r.server_id = s.id
      WHERE r.id = ?
    `).get(roleId)

    if (!role) {
      return res.status(404).json({ error: 'Role not found' })
    }

    // Check permissions
    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(role.server_id, userId)

    if (role.server_id && role.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Check if target user is member
    const targetMember = db.prepare(`
      SELECT id FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(role.server_id, targetUserId)

    if (!targetMember) {
      return res.status(400).json({ error: 'User is not a member of this server' })
    }

    // Check if already has role
    const existing = db.prepare(`
      SELECT id FROM server_role_members 
      WHERE server_id = ? AND user_id = ? AND role_id = ?
    `).get(role.server_id, targetUserId, roleId)

    if (existing) {
      return res.json({ success: true, message: 'User already has this role' })
    }

    db.prepare(`
      INSERT INTO server_role_members (server_id, user_id, role_id, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(role.server_id, targetUserId, roleId)

    res.json({ success: true })
  } catch (error) {
    console.error('Assign role error:', error)
    res.status(500).json({ error: 'Failed to assign role' })
  }
})

// Remove role from user
router.delete('/:roleId/assign/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { roleId, userId: targetUserId } = req.params
    const userId = req.user.id

    const role = db.prepare(`
      SELECT r.*, s.owner_id 
      FROM server_roles r
      JOIN communities s ON r.server_id = s.id
      WHERE r.id = ?
    `).get(roleId)

    if (!role) {
      return res.status(404).json({ error: 'Role not found' })
    }

    // Check permissions
    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(role.server_id, userId)

    if (role.server_id && role.owner_id !== userId && member?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare(`
      DELETE FROM server_role_members 
      WHERE server_id = ? AND user_id = ? AND role_id = ?
    `).run(role.server_id, targetUserId, roleId)

    res.json({ success: true })
  } catch (error) {
    console.error('Remove role error:', error)
    res.status(500).json({ error: 'Failed to remove role' })
  }
})

// Get user roles for a server
router.get('/server/:serverId/user/:userId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId, userId } = req.params

    const roles = db.prepare(`
      SELECT r.*
      FROM server_roles r
      JOIN server_role_members rm ON r.id = rm.role_id
      WHERE rm.server_id = ? AND rm.user_id = ?
      ORDER BY r.position DESC
    `).all(serverId, userId)

    res.json({ roles })
  } catch (error) {
    console.error('Get user roles error:', error)
    res.status(500).json({ error: 'Failed to get user roles' })
  }
})

export default router
