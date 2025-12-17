import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Update activity status
router.put('/status', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { status, custom_status, game_name, game_type, game_url } = req.body

    if (!status) {
      return res.status(400).json({ error: 'Status is required' })
    }

    const validStatuses = ['online', 'idle', 'dnd', 'offline', 'invisible']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    // Check if status exists
    const existing = db.prepare('SELECT id FROM user_activity_status WHERE user_id = ?').get(userId)

    if (existing) {
      db.prepare(`
        UPDATE user_activity_status 
        SET status = ?, custom_status = ?, game_name = ?, game_type = ?, game_url = ?, 
            since = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(status, custom_status || null, game_name || null, game_type || null, game_url || null, userId)
    } else {
      db.prepare(`
        INSERT INTO user_activity_status (
          user_id, status, custom_status, game_name, game_type, game_url, 
          since, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(userId, status, custom_status || null, game_name || null, game_type || null, game_url || null)
    }

    const activityStatus = db.prepare('SELECT * FROM user_activity_status WHERE user_id = ?').get(userId)
    res.json({ activity_status: activityStatus })
  } catch (error) {
    console.error('Update activity status error:', error)
    res.status(500).json({ error: 'Failed to update activity status' })
  }
})

// Get activity status
router.get('/status/:userId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { userId } = req.params

    const activityStatus = db.prepare(`
      SELECT * FROM user_activity_status WHERE user_id = ?
    `).get(userId)

    if (!activityStatus) {
      return res.json({ 
        activity_status: {
          user_id: parseInt(userId),
          status: 'offline',
          custom_status: null,
          game_name: null,
          game_type: null,
          game_url: null
        }
      })
    }

    res.json({ activity_status: activityStatus })
  } catch (error) {
    console.error('Get activity status error:', error)
    res.status(500).json({ error: 'Failed to get activity status' })
  }
})

// Get multiple users' activity status
router.post('/status/bulk', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { user_ids } = req.body

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' })
    }

    const placeholders = user_ids.map(() => '?').join(',')
    const statuses = db.prepare(`
      SELECT * FROM user_activity_status 
      WHERE user_id IN (${placeholders})
    `).all(...user_ids)

    // Create map for quick lookup
    const statusMap = {}
    statuses.forEach(status => {
      statusMap[status.user_id] = status
    })

    // Fill in offline status for users without status
    user_ids.forEach(id => {
      if (!statusMap[id]) {
        statusMap[id] = {
          user_id: id,
          status: 'offline',
          custom_status: null,
          game_name: null,
          game_type: null,
          game_url: null
        }
      }
    })

    res.json({ activity_statuses: Object.values(statusMap) })
  } catch (error) {
    console.error('Get bulk activity status error:', error)
    res.status(500).json({ error: 'Failed to get activity statuses' })
  }
})

export default router
