import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Search messages
router.get('/messages', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { 
      query, 
      channel_id, 
      server_id, 
      author_id,
      limit = 25,
      offset = 0 
    } = req.query

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' })
    }

    // Enhanced search with multiple matching strategies
    const searchTerms = query.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0)
    
    let sql = `
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status,
        c.name as channel_name,
        c.server_id,
        s.name as server_name,
        CASE 
          WHEN LOWER(m.content) LIKE ? THEN 3
          WHEN LOWER(m.content) LIKE ? THEN 2
          ELSE 1
        END as relevance_score
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      JOIN channels c ON m.channel_id = c.id
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE (
        LOWER(m.content) LIKE ? OR
        LOWER(u.username) LIKE ? OR
        LOWER(up.display_name) LIKE ?
    `
    const params = [
      `%${query}%`, // Exact phrase match (highest relevance)
      `%${searchTerms.join('%')}%`, // All terms match
      `%${query}%`, // Content match
      `%${query}%`, // Username match
      `%${query}%`  // Display name match
    ]
    
    // Add individual term matching for better results
    searchTerms.forEach(term => {
      sql += ` OR LOWER(m.content) LIKE ?`
      params.push(`%${term}%`)
    })
    
    sql += ')'

    // Filter by channel
    if (channel_id) {
      sql += ' AND m.channel_id = ?'
      params.push(channel_id)
    }

    // Filter by server
    if (server_id) {
      sql += ' AND c.server_id = ?'
      params.push(server_id)
    }

    // Filter by author
    if (author_id) {
      sql += ' AND m.user_id = ?'
      params.push(author_id)
    }

    // Check if user has access to channels
    sql += ` AND (
      c.server_id IS NULL OR
      EXISTS (
        SELECT 1 FROM community_members cm 
        WHERE cm.community_id = c.server_id AND cm.user_id = ?
      )
    )`

    params.push(userId)

    sql += ' ORDER BY relevance_score DESC, m.created_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), parseInt(offset))

    const messages = db.prepare(sql).all(...params)
    
    // Convert avatar URLs to full URLs
    messages.forEach(message => {
      if (message.avatar_url) {
        const baseUrl = process.env.CLIENT_URL?.replace(':5173', ':3000') || 'http://localhost:3000'
        if (!message.avatar_url.startsWith('http://') && !message.avatar_url.startsWith('https://')) {
          message.avatar_url = `${baseUrl}${message.avatar_url.startsWith('/') ? '' : '/'}${message.avatar_url}`
        }
      }
    })

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM channel_messages m
      JOIN channels c ON m.channel_id = c.id
      WHERE m.content LIKE ?
    `
    const countParams = [`%${query}%`]

    if (channel_id) {
      countSql += ' AND m.channel_id = ?'
      countParams.push(channel_id)
    }
    if (server_id) {
      countSql += ' AND c.server_id = ?'
      countParams.push(server_id)
    }
    if (author_id) {
      countSql += ' AND m.user_id = ?'
      countParams.push(author_id)
    }

    countSql += ` AND (
      c.server_id IS NULL OR
      EXISTS (
        SELECT 1 FROM community_members cm 
        WHERE cm.community_id = c.server_id AND cm.user_id = ?
      )
    )`
    countParams.push(userId)

    const total = db.prepare(countSql).get(...countParams)?.total || 0
    
    // Convert avatar URLs to full URLs
    messages.forEach(message => {
      if (message.avatar_url) {
        const baseUrl = process.env.CLIENT_URL?.replace(':5173', ':3000') || 'http://localhost:3000'
        if (!message.avatar_url.startsWith('http://') && !message.avatar_url.startsWith('https://')) {
          message.avatar_url = `${baseUrl}${message.avatar_url.startsWith('/') ? '' : '/'}${message.avatar_url}`
        }
      }
    })

    res.json({ messages, total, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (error) {
    console.error('Search messages error:', error)
    res.status(500).json({ error: 'Failed to search messages' })
  }
})

// Search channels
router.get('/channels', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { query, server_id, limit = 20 } = req.query

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' })
    }

    let sql = `
      SELECT 
        c.*,
        s.name as server_name
      FROM channels c
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE c.name LIKE ?
        AND (
          c.server_id IS NULL OR
          EXISTS (
            SELECT 1 FROM community_members cm 
            WHERE cm.community_id = c.server_id AND cm.user_id = ?
          )
        )
    `
    const params = [`%${query}%`, userId]

    if (server_id) {
      sql += ' AND c.server_id = ?'
      params.push(server_id)
    }

    sql += ' ORDER BY c.name ASC LIMIT ?'
    params.push(parseInt(limit))

    const channels = db.prepare(sql).all(...params)

    res.json({ channels })
  } catch (error) {
    console.error('Search channels error:', error)
    res.status(500).json({ error: 'Failed to search channels' })
  }
})

// Search servers
router.get('/servers', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { query, limit = 20 } = req.query

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' })
    }

    const servers = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
      FROM communities c
      WHERE (c.name LIKE ? OR c.description LIKE ?)
        AND c.is_public = 1
        AND EXISTS (
          SELECT 1 FROM community_members cm 
          WHERE cm.community_id = c.id AND cm.user_id = ?
        )
      ORDER BY c.member_count DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, userId, parseInt(limit))

    res.json({ servers })
  } catch (error) {
    console.error('Search servers error:', error)
    res.status(500).json({ error: 'Failed to search servers' })
  }
})

export default router
