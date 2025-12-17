import express from 'express'
import { getDatabase } from '../database/init.js'

const router = express.Router()

// Middleware to authenticate and check permissions
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  
  // Verify JWT token
  try {
    const jwt = await import('jsonwebtoken')
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    req.user = decoded
    next()
  } catch (error) {
    console.error('JWT verification error:', error)
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

// Helper to check if user has moderation permissions
function hasModerationPermission(userId, serverId, db) {
  const member = db.prepare(`
    SELECT role FROM community_members 
    WHERE community_id = ? AND user_id = ?
  `).get(serverId, userId)
  
  if (!member) return false
  
  const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(serverId)
  if (server && server.owner_id === userId) return true
  
  return member.role === 'admin' || member.role === 'moderator'
}

// ============================================
// AUTO-MODERATION RULES
// ============================================

// Get all auto-moderation rules for a server
router.get('/auto-mod/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id

    if (!hasModerationPermission(userId, serverId, db)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    const rules = db.prepare(`
      SELECT * FROM auto_moderation_rules 
      WHERE server_id = ?
      ORDER BY created_at DESC
    `).all(serverId)

    res.json({ rules })
  } catch (error) {
    console.error('Get auto-mod rules error:', error)
    res.status(500).json({ error: 'Failed to get auto-moderation rules' })
  }
})

// Create auto-moderation rule
router.post('/auto-mod/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id

    if (!hasModerationPermission(userId, serverId, db)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    const {
      name,
      enabled = true,
      rule_type,
      trigger_count = 5,
      trigger_timeframe = 60,
      action_type,
      action_duration,
      exempt_roles,
      exempt_channels,
      word_filter,
      spam_detection = true,
      mention_spam = true
    } = req.body

    const result = db.prepare(`
      INSERT INTO auto_moderation_rules (
        server_id, name, enabled, rule_type, trigger_count, trigger_timeframe,
        action_type, action_duration, exempt_roles, exempt_channels,
        word_filter, spam_detection, mention_spam, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      serverId, name, enabled ? 1 : 0, rule_type, trigger_count, trigger_timeframe,
      action_type, action_duration, exempt_roles ? JSON.stringify(exempt_roles) : null,
      exempt_channels ? JSON.stringify(exempt_channels) : null,
      word_filter ? JSON.stringify(word_filter) : null,
      spam_detection ? 1 : 0, mention_spam ? 1 : 0, userId
    )

    res.json({ rule: { id: result.lastInsertRowid, ...req.body } })
  } catch (error) {
    console.error('Create auto-mod rule error:', error)
    res.status(500).json({ error: 'Failed to create auto-moderation rule' })
  }
})

// Update auto-moderation rule
router.put('/auto-mod/:ruleId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { ruleId } = req.params
    const userId = req.user.id

    const rule = db.prepare('SELECT server_id FROM auto_moderation_rules WHERE id = ?').get(ruleId)
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' })
    }

    if (!hasModerationPermission(userId, rule.server_id, db)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    const updates = []
    const values = []

    Object.keys(req.body).forEach(key => {
      if (['exempt_roles', 'exempt_channels', 'word_filter'].includes(key) && req.body[key]) {
        updates.push(`${key} = ?`)
        values.push(JSON.stringify(req.body[key]))
      } else if (key !== 'id' && key !== 'server_id' && key !== 'created_by' && key !== 'created_at') {
        updates.push(`${key} = ?`)
        values.push(req.body[key])
      }
    })

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(ruleId)

    db.prepare(`
      UPDATE auto_moderation_rules 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values)

    const updated = db.prepare('SELECT * FROM auto_moderation_rules WHERE id = ?').get(ruleId)
    res.json({ rule: updated })
  } catch (error) {
    console.error('Update auto-mod rule error:', error)
    res.status(500).json({ error: 'Failed to update auto-moderation rule' })
  }
})

// Delete auto-moderation rule
router.delete('/auto-mod/:ruleId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { ruleId } = req.params
    const userId = req.user.id

    const rule = db.prepare('SELECT server_id FROM auto_moderation_rules WHERE id = ?').get(ruleId)
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' })
    }

    if (!hasModerationPermission(userId, rule.server_id, db)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    db.prepare('DELETE FROM auto_moderation_rules WHERE id = ?').run(ruleId)
    res.json({ success: true })
  } catch (error) {
    console.error('Delete auto-mod rule error:', error)
    res.status(500).json({ error: 'Failed to delete auto-moderation rule' })
  }
})

// ============================================
// AUDIT LOGS
// ============================================

// Get audit logs for a server
router.get('/audit/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id
    const { limit = 100, offset = 0, action_type } = req.query

    if (!hasModerationPermission(userId, serverId, db)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    let query = `
      SELECT 
        al.*,
        u.username as user_username,
        u.avatar_url as user_avatar_url
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.server_id = ?
    `
    const params = [serverId]

    if (action_type) {
      query += ' AND al.action_type = ?'
      params.push(action_type)
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), parseInt(offset))

    const logs = db.prepare(query).all(...params)

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs WHERE server_id = ?
      ${action_type ? ' AND action_type = ?' : ''}
    `).get(serverId, ...(action_type ? [action_type] : []))

    res.json({ logs, total: total.count })
  } catch (error) {
    console.error('Get audit logs error:', error)
    res.status(500).json({ error: 'Failed to get audit logs' })
  }
})

// Create audit log entry (internal use)
export function createAuditLog(serverId, userId, actionType, options = {}) {
  try {
    const db = getDatabase()
    const {
      targetType,
      targetId,
      targetName,
      reason,
      changes,
      ipAddress
    } = options

    db.prepare(`
      INSERT INTO audit_logs (
        server_id, user_id, action_type, target_type, target_id,
        target_name, reason, changes, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      serverId, userId, actionType, targetType || null, targetId || null,
      targetName || null, reason || null,
      changes ? JSON.stringify(changes) : null, ipAddress || null
    )
  } catch (error) {
    console.error('Create audit log error:', error)
  }
}

// ============================================
// MODERATION ACTIONS
// ============================================

// Get moderation actions for a user/server
router.get('/actions/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id
    const { targetUserId } = req.query

    if (!hasModerationPermission(userId, serverId, db)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    let query = `
      SELECT 
        ma.*,
        u.username as target_username,
        u.avatar_url as target_avatar_url,
        mod.username as moderator_username
      FROM moderation_actions ma
      LEFT JOIN users u ON ma.user_id = u.id
      LEFT JOIN users mod ON ma.created_by = mod.id
      WHERE ma.server_id = ?
    `
    const params = [serverId]

    if (targetUserId) {
      query += ' AND ma.user_id = ?'
      params.push(targetUserId)
    }

    query += ' ORDER BY ma.created_at DESC LIMIT 50'

    const actions = db.prepare(query).all(...params)
    res.json({ actions })
  } catch (error) {
    console.error('Get moderation actions error:', error)
    res.status(500).json({ error: 'Failed to get moderation actions' })
  }
})

// Create moderation action (ban, kick, mute, warn)
router.post('/actions/:serverId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id

    if (!hasModerationPermission(userId, serverId, db)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    const {
      targetUserId,
      actionType,
      reason,
      duration
    } = req.body

    let expiresAt = null
    if (duration && duration > 0) {
      const expires = new Date()
      expires.setSeconds(expires.getSeconds() + duration)
      expiresAt = expires.toISOString()
    }

    const result = db.prepare(`
      INSERT INTO moderation_actions (
        server_id, user_id, action_type, reason, duration, expires_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(serverId, targetUserId, actionType, reason, duration, expiresAt, userId)

    // Create audit log
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(targetUserId)
    createAuditLog(serverId, userId, actionType, {
      targetType: 'user',
      targetId: targetUserId,
      targetName: targetUser?.username,
      reason,
      ipAddress: req.ip
    })

    // Apply action (remove from server for ban/kick, etc.)
    if (actionType === 'ban' || actionType === 'kick') {
      db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?')
        .run(serverId, targetUserId)
    }

    res.json({ action: { id: result.lastInsertRowid, ...req.body } })
  } catch (error) {
    console.error('Create moderation action error:', error)
    res.status(500).json({ error: 'Failed to create moderation action' })
  }
})

export default router
