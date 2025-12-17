import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

console.log('🔊 Voice routes module loaded')

// Helper function to get full avatar URL
function getFullAvatarUrl(avatarUrl) {
  if (!avatarUrl || avatarUrl === '') return null
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl
  const baseUrl = process.env.CLIENT_URL?.replace(':5173', ':3000') || 'http://localhost:3000'
  return `${baseUrl}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`
}

// Test route to verify voice routes are working
router.get('/test', (req, res) => {
  console.log('✅ Voice test route hit')
  res.json({ message: 'Voice routes are working' })
})

// Join a voice channel
router.post('/join', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { channel_id, server_id } = req.body

    console.log('Voice join request:', { userId, channel_id, server_id })

    if (!channel_id || !server_id) {
      return res.status(400).json({ error: 'Channel ID and Server ID are required' })
    }

    // Verify channel exists and is a voice/video channel
    const channel = db.prepare(`
      SELECT id, type, server_id, user_limit 
      FROM channels 
      WHERE id = ? AND server_id = ?
    `).get(channel_id, server_id)

    if (!channel) {
      console.error('Channel not found:', channel_id, server_id)
      return res.status(404).json({ error: 'Channel not found' })
    }

    if (!['voice', 'video'].includes(channel.type)) {
      console.error('Invalid channel type:', channel.type)
      return res.status(400).json({ error: 'Channel is not a voice or video channel' })
    }

    // Check user limit
    if (channel.user_limit > 0) {
      const currentUsers = db.prepare(`
        SELECT COUNT(*) as count 
        FROM voice_states 
        WHERE channel_id = ? AND session_id IS NOT NULL
      `).get(channel_id)
      
      if (currentUsers.count >= channel.user_limit) {
        return res.status(403).json({ error: 'Channel is full' })
      }
    }

    // Check if user is already in a voice channel
    const existingState = db.prepare(`
      SELECT id, channel_id, server_id 
      FROM voice_states 
      WHERE user_id = ? AND session_id IS NOT NULL
    `).get(userId)

    if (existingState) {
      // Leave previous channel
      db.prepare(`
        DELETE FROM voice_states 
        WHERE id = ?
      `).run(existingState.id)

      // Emit leave event to both old channel and server
      const io = global.io
      if (io) {
        io.to(`channel:${existingState.channel_id}`).emit('voice_state_update', {
          user_id: userId,
          channel_id: null,
          action: 'leave'
        })
        io.to(`server:${existingState.server_id}`).emit('voice_state_update', {
          user_id: userId,
          channel_id: null,
          action: 'leave'
        })
      }
    }

    // Create new voice state
    const sessionId = `session_${Date.now()}_${userId}`
    const result = db.prepare(`
      INSERT INTO voice_states (
        user_id, channel_id, server_id, session_id, self_mute, self_deaf, 
        self_video, self_stream, created_at
      )
      VALUES (?, ?, ?, ?, 0, 0, ?, 0, CURRENT_TIMESTAMP)
    `).run(
      userId,
      channel_id,
      server_id,
      sessionId,
      channel.type === 'video' ? 1 : 0 // Auto-enable video for video channels
    )

    const voiceState = db.prepare(`
      SELECT 
        vs.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status
      FROM voice_states vs
      JOIN users u ON vs.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE vs.id = ?
    `).get(result.lastInsertRowid)

    // Convert avatar URL to full URL
    if (voiceState.avatar_url) {
      voiceState.avatar_url = getFullAvatarUrl(voiceState.avatar_url)
    }

    // Emit join event to channel and server
    const io = global.io
    if (io) {
      io.to(`channel:${channel_id}`).emit('voice_state_update', {
        user_id: userId,
        channel_id: channel_id,
        action: 'join',
        voice_state: voiceState
      })
      io.to(`server:${server_id}`).emit('voice_state_update', {
        user_id: userId,
        channel_id: channel_id,
        action: 'join',
        voice_state: voiceState
      })
    }

    res.json({ voice_state: voiceState, session_id: sessionId })
  } catch (error) {
    console.error('Join voice channel error:', error)
    res.status(500).json({ error: 'Failed to join voice channel' })
  }
})

// Leave voice channel
router.post('/leave', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id

    const voiceState = db.prepare(`
      SELECT id, channel_id, server_id 
      FROM voice_states 
      WHERE user_id = ? AND session_id IS NOT NULL
    `).get(userId)

    if (!voiceState) {
      return res.status(404).json({ error: 'Not in a voice channel' })
    }

    db.prepare(`
      DELETE FROM voice_states 
      WHERE id = ?
    `).run(voiceState.id)

    // Emit leave event
    const io = global.io
    if (io) {
      io.to(`channel:${voiceState.channel_id}`).emit('voice_state_update', {
        user_id: userId,
        channel_id: null,
        action: 'leave'
      })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Leave voice channel error:', error)
    res.status(500).json({ error: 'Failed to leave voice channel' })
  }
})

// Update voice state (mute, deaf, video, etc.)
router.put('/state', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { self_mute, self_deaf, self_video, self_stream } = req.body

    const voiceState = db.prepare(`
      SELECT id, channel_id 
      FROM voice_states 
      WHERE user_id = ? AND session_id IS NOT NULL
    `).get(userId)

    if (!voiceState) {
      return res.status(404).json({ error: 'Not in a voice channel' })
    }

    const updates = []
    const values = []

    if (self_mute !== undefined) {
      updates.push('self_mute = ?')
      values.push(self_mute ? 1 : 0)
    }
    if (self_deaf !== undefined) {
      updates.push('self_deaf = ?')
      values.push(self_deaf ? 1 : 0)
    }
    if (self_video !== undefined) {
      updates.push('self_video = ?')
      values.push(self_video ? 1 : 0)
    }
    if (self_stream !== undefined) {
      updates.push('self_stream = ?')
      values.push(self_stream ? 1 : 0)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' })
    }

    values.push(voiceState.id)
    db.prepare(`
      UPDATE voice_states 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values)

    const updatedState = db.prepare(`
      SELECT 
        vs.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status
      FROM voice_states vs
      JOIN users u ON vs.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE vs.id = ?
    `).get(voiceState.id)

    // Convert avatar URL to full URL
    if (updatedState.avatar_url) {
      updatedState.avatar_url = getFullAvatarUrl(updatedState.avatar_url)
    }

    // Emit update event
    const io = global.io
    if (io) {
      io.to(`channel:${voiceState.channel_id}`).emit('voice_state_update', {
        user_id: userId,
        channel_id: voiceState.channel_id,
        action: 'update',
        voice_state: updatedState
      })
    }

    res.json({ voice_state: updatedState })
  } catch (error) {
    console.error('Update voice state error:', error)
    res.status(500).json({ error: 'Failed to update voice state' })
  }
})

// Get voice states for a channel
// IMPORTANT: This route must come before /server/:serverId to avoid route conflicts
router.get('/channel/:channelId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const channelId = parseInt(req.params.channelId)

    console.log('Fetching voice states for channel:', channelId)

    if (!channelId || isNaN(channelId)) {
      return res.status(400).json({ error: 'Valid channel ID is required' })
    }

    // Verify channel exists
    const channel = db.prepare('SELECT id, type FROM channels WHERE id = ?').get(channelId)
    if (!channel) {
      console.error('Channel not found:', channelId)
      return res.status(404).json({ error: 'Channel not found' })
    }

    const voiceStates = db.prepare(`
      SELECT 
        vs.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status
      FROM voice_states vs
      JOIN users u ON vs.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE vs.channel_id = ? AND vs.session_id IS NOT NULL
      ORDER BY vs.created_at ASC
    `).all(channelId)

    // Convert avatar URLs to full URLs
    voiceStates.forEach(state => {
      if (state.avatar_url) {
        state.avatar_url = getFullAvatarUrl(state.avatar_url)
      }
    })

    console.log(`Found ${voiceStates.length} voice states for channel ${channelId}`)
    res.json({ voice_states: voiceStates || [] })
  } catch (error) {
    console.error('Get voice states error:', error)
    res.status(500).json({ error: 'Failed to get voice states', details: error.message })
  }
})

// Get voice states for a server
router.get('/server/:serverId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params

    const voiceStates = db.prepare(`
      SELECT 
        vs.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status
      FROM voice_states vs
      JOIN users u ON vs.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE vs.server_id = ? AND vs.session_id IS NOT NULL
      ORDER BY vs.created_at ASC
    `).all(serverId)

    // Convert avatar URLs to full URLs
    voiceStates.forEach(state => {
      if (state.avatar_url) {
        state.avatar_url = getFullAvatarUrl(state.avatar_url)
      }
    })

    res.json({ voice_states: voiceStates })
  } catch (error) {
    console.error('Get voice states error:', error)
    res.status(500).json({ error: 'Failed to get voice states' })
  }
})

// Log routes on module load
setTimeout(() => {
  console.log('🔊 Voice routes registered:', {
    join: 'POST /api/voice/join',
    leave: 'POST /api/voice/leave',
    state: 'PUT /api/voice/state',
    channel: 'GET /api/voice/channel/:channelId',
    server: 'GET /api/voice/server/:serverId',
    test: 'GET /api/voice/test'
  })
}, 100)

export default router
