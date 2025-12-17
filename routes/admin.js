import express from 'express'
import bcrypt from 'bcryptjs'
import { getDatabase } from '../database/init.js'
import { createCarlbot } from '../scripts/create-carlbot.js'
import { authenticateAdmin, generateAdminToken } from '../middleware/adminAuth.js'
import { getCarlbotId } from './bot.js'

const router = express.Router()

// Helper to log bot activity (exported for use in bot.js)
export function logBotActivity(db, botUserId, actionType, actionDetails, targetType = null, targetId = null, success = true, errorMessage = null, metadata = null) {
  try {
    db.prepare(`
      INSERT INTO bot_activity_log (bot_user_id, action_type, action_details, target_type, target_id, success, error_message, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      botUserId,
      actionType,
      typeof actionDetails === 'string' ? actionDetails : JSON.stringify(actionDetails),
      targetType,
      targetId,
      success ? 1 : 0,
      errorMessage,
      metadata ? JSON.stringify(metadata) : null
    )
  } catch (error) {
    console.error('Failed to log bot activity:', error)
  }
}

// Admin login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }
    
    const db = getDatabase()
    const admin = db.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(username)
    
    if (!admin) {
      // Use same delay for both cases to prevent username enumeration
      await bcrypt.compare(password, '$2a$10$dummyhash') // Dummy comparison for timing
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    const isValid = await bcrypt.compare(password, admin.password_hash)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    // Update last login
    db.prepare('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id)
    
    // Generate admin token
    const token = generateAdminToken(admin)
    
    // Log login activity
    const carlbot = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
    if (carlbot) {
      logBotActivity(
        db,
        carlbot.id,
        'admin_login',
        `Admin ${username} logged in`,
        'admin',
        admin.id,
        true,
        null,
        { username, timestamp: new Date().toISOString() }
      )
    }
    
    res.json({ 
      success: true, 
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email
      }
    })
  } catch (error) {
    console.error('Admin login error:', error)
    res.status(500).json({ error: 'Failed to authenticate' })
  }
})

// Verify admin token
router.get('/verify', authenticateAdmin, (req, res) => {
  res.json({ 
    success: true, 
    admin: req.admin 
  })
})

// Get Carlbot activity log
router.get('/activity', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { limit = 100, offset = 0, action_type, start_date, end_date } = req.query
    
    let query = `
      SELECT 
        bal.*,
        u.username as bot_username,
        sp.content as post_content,
        pc.comment as comment_content
      FROM bot_activity_log bal
      JOIN users u ON bal.bot_user_id = u.id
      LEFT JOIN social_posts sp ON bal.target_type = 'post' AND bal.target_id = sp.id
      LEFT JOIN post_comments pc ON bal.target_type = 'comment' AND bal.target_id = pc.id
      WHERE 1=1
    `
    const params = []
    
    if (action_type) {
      query += ' AND bal.action_type = ?'
      params.push(action_type)
    }
    
    if (start_date) {
      query += ' AND datetime(bal.created_at) >= datetime(?)'
      params.push(start_date)
    }
    
    if (end_date) {
      query += ' AND datetime(bal.created_at) <= datetime(?)'
      params.push(end_date)
    }
    
    query += ' ORDER BY bal.created_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), parseInt(offset))
    
    const activities = db.prepare(query).all(...params)
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM bot_activity_log WHERE 1=1'
    const countParams = []
    if (action_type) {
      countQuery += ' AND action_type = ?'
      countParams.push(action_type)
    }
    if (start_date) {
      countQuery += ' AND datetime(created_at) >= datetime(?)'
      countParams.push(start_date)
    }
    if (end_date) {
      countQuery += ' AND datetime(created_at) <= datetime(?)'
      countParams.push(end_date)
    }
    const total = db.prepare(countQuery).get(...countParams)?.total || 0
    
    res.json({ activities, total, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (error) {
    console.error('Get activity error:', error)
    res.status(500).json({ error: 'Failed to get activity log' })
  }
})

// Get scheduler status and countdown
router.get('/scheduler/status', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const status = db.prepare('SELECT * FROM scheduler_status WHERE id = 1').get()
    
    if (!status) {
      return res.json({
        isRunning: false,
        nextRun: null,
        lastRun: null,
        intervalMinutes: 30,
        countdown: null
      })
    }
    
    const nextRun = status.next_run ? new Date(status.next_run) : null
    const lastRun = status.last_run ? new Date(status.last_run) : null
    const now = new Date()
    
    let countdown = null
    if (nextRun && nextRun > now) {
      const diff = nextRun.getTime() - now.getTime()
      countdown = {
        totalSeconds: Math.floor(diff / 1000),
        minutes: Math.floor(diff / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
      }
    }
    
    let lastRunResult = null
    if (status.last_run_result) {
      try {
        lastRunResult = JSON.parse(status.last_run_result)
      } catch (e) {
        lastRunResult = { raw: status.last_run_result }
      }
    }
    
    res.json({
      isRunning: status.is_running === 1,
      nextRun: nextRun ? nextRun.toISOString() : null,
      lastRun: lastRun ? lastRun.toISOString() : null,
      intervalMinutes: status.interval_minutes || 30,
      countdown,
      lastRunResult
    })
  } catch (error) {
    console.error('Get scheduler status error:', error)
    res.status(500).json({ error: 'Failed to get scheduler status' })
  }
})

// Get Carlbot statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const carlbot = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
    
    if (!carlbot) {
      return res.json({ error: 'Carlbot not found' })
    }
    
    const carlbotId = carlbot.id
    
    // Get activity stats
    const activityStats = db.prepare(`
      SELECT 
        action_type,
        COUNT(*) as count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
      FROM bot_activity_log
      WHERE bot_user_id = ?
        AND datetime(created_at) > datetime('now', '-7 days')
      GROUP BY action_type
    `).all(carlbotId)
    
    // Get recent activity summary
    const recentActivity = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_actions,
        SUM(CASE WHEN action_type = 'like' THEN 1 ELSE 0 END) as likes,
        SUM(CASE WHEN action_type = 'comment' THEN 1 ELSE 0 END) as comments,
        SUM(CASE WHEN action_type = 'retweet' THEN 1 ELSE 0 END) as retweets,
        SUM(CASE WHEN action_type = 'create_post' THEN 1 ELSE 0 END) as posts_created,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors
      FROM bot_activity_log
      WHERE bot_user_id = ?
        AND datetime(created_at) > datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all(carlbotId)
    
    // Get interaction stats
    const interactionStats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM post_likes WHERE user_id = ?) as total_likes,
        (SELECT COUNT(*) FROM post_comments WHERE user_id = ?) as total_comments,
        (SELECT COUNT(*) FROM post_retweets WHERE user_id = ?) as total_retweets,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = ?) as total_posts,
        (SELECT AVG(likes_count) FROM post_comments WHERE user_id = ?) as avg_comment_likes,
        (SELECT AVG(likes_count) FROM social_posts WHERE user_id = ?) as avg_post_likes
    `).get(carlbotId, carlbotId, carlbotId, carlbotId, carlbotId, carlbotId)
    
    res.json({
      activityStats,
      recentActivity,
      interactionStats,
      carlbotId
    })
  } catch (error) {
    console.error('Get stats error:', error)
    res.status(500).json({ error: 'Failed to get statistics' })
  }
})

// Get bot configuration
router.get('/config', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const config = db.prepare('SELECT * FROM bot_config ORDER BY config_key').all()
    
    const configObj = {}
    config.forEach(item => {
      configObj[item.config_key] = {
        value: item.config_value,
        description: item.description,
        updatedAt: item.updated_at,
        updatedBy: item.updated_by
      }
    })
    
    res.json(configObj)
  } catch (error) {
    console.error('Get config error:', error)
    res.status(500).json({ error: 'Failed to get configuration' })
  }
})

// Update bot configuration
router.put('/config', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { configKey, configValue } = req.body
    
    if (!configKey || configValue === undefined) {
      return res.status(400).json({ error: 'configKey and configValue are required' })
    }
    
    // Check if config exists
    const existing = db.prepare('SELECT config_key FROM bot_config WHERE config_key = ?').get(configKey)
    
    if (existing) {
      db.prepare(`
        UPDATE bot_config 
        SET config_value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE config_key = ?
      `).run(configValue, configKey)
    } else {
      db.prepare(`
        INSERT INTO bot_config (config_key, config_value, description)
        VALUES (?, ?, ?)
      `).run(configKey, configValue, `Configuration for ${configKey}`)
    }
    
    // Log the config change
    const carlbot = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
    if (carlbot) {
      logBotActivity(
        db,
        carlbot.id,
        'config_update',
        `Admin ${req.admin.username} updated ${configKey}`,
        'config',
        null,
        true,
        null,
        { 
          configKey, 
          oldValue: existing ? existing.config_value : null, 
          newValue: configValue,
          adminUsername: req.admin.username
        }
      )
    }
    
    res.json({ success: true, message: 'Configuration updated' })
  } catch (error) {
    console.error('Update config error:', error)
    res.status(500).json({ error: 'Failed to update configuration' })
  }
})

// Manually trigger bot actions
router.post('/trigger/:action', authenticateAdmin, async (req, res) => {
  try {
    const { action } = req.params
    const { limit = 5, topic, game_id, community_id } = req.body
    
    const API_BASE = `http://localhost:${process.env.PORT || 3000}/api`
    
    let response
    let result
    
    switch (action) {
      case 'auto-interact':
        response = await fetch(`${API_BASE}/bot/auto-interact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit })
        })
        result = await response.json()
        break
        
      case 'create-post':
        response = await fetch(`${API_BASE}/bot/create-post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, game_id, community_id })
        })
        result = await response.json()
        break
        
      default:
        return res.status(400).json({ error: 'Invalid action' })
    }
    
    if (response.ok) {
      res.json({ success: true, result })
    } else {
      res.status(response.status).json({ error: result.error || 'Action failed' })
    }
  } catch (error) {
    console.error('Trigger action error:', error)
    res.status(500).json({ error: 'Failed to trigger action' })
  }
})

// Get real-time activity feed (last N activities)
router.get('/activity/feed', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { limit = 20, action_type } = req.query
    
    let query = `
      SELECT 
        bal.*,
        u.username as bot_username,
        sp.content as post_content,
        pc.comment as comment_content
      FROM bot_activity_log bal
      JOIN users u ON bal.bot_user_id = u.id
      LEFT JOIN social_posts sp ON bal.target_type = 'post' AND bal.target_id = sp.id
      LEFT JOIN post_comments pc ON bal.target_type = 'comment' AND bal.target_id = pc.id
      WHERE 1=1
    `
    const params = []
    
    if (action_type) {
      query += ' AND bal.action_type = ?'
      params.push(action_type)
    }
    
    query += ' ORDER BY bal.created_at DESC LIMIT ?'
    params.push(parseInt(limit))
    
    const activities = db.prepare(query).all(...params)
    
    res.json(activities)
  } catch (error) {
    console.error('Get activity feed error:', error)
    res.status(500).json({ error: 'Failed to get activity feed' })
  }
})

// Get moderation logs
router.get('/moderation/logs', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { limit = 100, type } = req.query
    
    // Get moderation actions from bot_activity_log
    let query = `
      SELECT 
        bal.*,
        u.username as bot_username,
        sp.content as post_content,
        sp.id as post_id,
        sp.user_id as post_author_id,
        u2.username as post_author_username,
        pc.comment as comment_content,
        pc.id as comment_id,
        pc.user_id as comment_author_id,
        u3.username as comment_author_username
      FROM bot_activity_log bal
      JOIN users u ON bal.bot_user_id = u.id
      LEFT JOIN social_posts sp ON bal.target_type = 'post' AND bal.target_id = sp.id
      LEFT JOIN users u2 ON sp.user_id = u2.id
      LEFT JOIN post_comments pc ON bal.target_type = 'comment' AND bal.target_id = pc.id
      LEFT JOIN users u3 ON pc.user_id = u3.id
      WHERE bal.action_type LIKE 'moderation_%'
    `
    const params = []
    
    if (type) {
      query += ' AND bal.action_type = ?'
      params.push(type)
    }
    
    query += ' ORDER BY bal.created_at DESC LIMIT ?'
    params.push(parseInt(limit))
    
    const logs = db.prepare(query).all(...params)
    
    // Parse metadata for each log
    const logsWithMetadata = logs.map(log => {
      let metadata = null
      if (log.metadata) {
        try {
          metadata = JSON.parse(log.metadata)
        } catch (e) {
          metadata = { raw: log.metadata }
        }
      }
      return {
        ...log,
        parsedMetadata: metadata
      }
    })
    
    res.json(logsWithMetadata)
  } catch (error) {
    console.error('Get moderation logs error:', error)
    res.status(500).json({ error: 'Failed to get moderation logs' })
  }
})

// Get banned users
router.get('/moderation/banned', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    
    const bannedUsers = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.created_at,
        u.last_login,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = u.id AND is_deleted = 1) as deleted_posts,
        (SELECT COUNT(*) FROM post_comments WHERE user_id = u.id AND is_deleted = 1) as deleted_comments,
        (SELECT MAX(created_at) FROM bot_activity_log 
         WHERE action_type LIKE 'moderation_%' 
         AND metadata LIKE '%"userId":' || u.id || '%') as banned_at
      FROM users u
      WHERE u.is_banned = 1
      ORDER BY banned_at DESC
    `).all()
    
    res.json(bannedUsers)
  } catch (error) {
    console.error('Get banned users error:', error)
    res.status(500).json({ error: 'Failed to get banned users' })
  }
})

// Get deleted content
router.get('/moderation/deleted', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { type = 'all', limit = 100 } = req.query
    
    const results = {
      posts: [],
      comments: []
    }
    
    if (type === 'all' || type === 'posts') {
      results.posts = db.prepare(`
        SELECT 
          sp.id,
          sp.content,
          sp.deleted_by,
          sp.deleted_reason,
          sp.created_at,
          sp.updated_at,
          u.username as author_username,
          u.id as author_id
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        WHERE sp.is_deleted = 1
        ORDER BY sp.updated_at DESC
        LIMIT ?
      `).all(parseInt(limit))
    }
    
    if (type === 'all' || type === 'comments') {
      results.comments = db.prepare(`
        SELECT 
          pc.id,
          pc.comment,
          pc.deleted_by,
          pc.deleted_reason,
          pc.created_at,
          pc.post_id,
          u.username as author_username,
          u.id as author_id,
          sp.content as post_content
        FROM post_comments pc
        JOIN users u ON pc.user_id = u.id
        LEFT JOIN social_posts sp ON pc.post_id = sp.id
        WHERE pc.is_deleted = 1
        ORDER BY pc.created_at DESC
        LIMIT ?
      `).all(parseInt(limit))
    }
    
    res.json(results)
  } catch (error) {
    console.error('Get deleted content error:', error)
    res.status(500).json({ error: 'Failed to get deleted content' })
  }
})

// Manually trigger moderation check
router.post('/moderation/check', authenticateAdmin, async (req, res) => {
  try {
    const { type, id, limit } = req.body
    const db = getDatabase()
    const { checkContent } = await import('../routes/moderation.js')
    
    if (type === 'post' && id) {
      // Check specific post
      const post = db.prepare('SELECT id, user_id, content FROM social_posts WHERE id = ?').get(id)
      if (!post) {
        return res.status(404).json({ error: 'Post not found' })
      }
      
      // Import checkContent function
      const { checkContent } = await import('../routes/moderation.js')
      const moderationResult = await checkContent(post.content)
      
      if (moderationResult.isRacist) {
        const carlbotId = await getCarlbotId()
        db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(post.user_id)
        db.prepare(`
          UPDATE social_posts 
          SET content = ?, 
              user_id = ?,
              is_deleted = 1,
              deleted_by = 'carlbot',
              deleted_reason = ?
          WHERE id = ?
        `).run('[deleted by carlbot]', carlbotId, `Content moderation: ${moderationResult.reason}`, post.id)
        
        logBotActivity(db, carlbotId, 'moderation_ban', `Banned user ${post.user_id} and deleted post ${post.id} for racist content`, 'post', post.id, true, null, {
          userId: post.user_id,
          postId: post.id,
          reason: moderationResult.reason,
          severity: moderationResult.severity
        })
        
        return res.json({
          action: 'banned_and_deleted',
          userId: post.user_id,
          postId: post.id,
          reason: moderationResult.reason
        })
      } else {
        return res.json({ action: 'approved', postId: post.id })
      }
    } else if (type === 'comment' && id) {
      // Check specific comment
      const comment = db.prepare('SELECT id, user_id, comment, post_id FROM post_comments WHERE id = ?').get(id)
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' })
      }
      
      // Import checkContent function
      const { checkContent } = await import('../routes/moderation.js')
      const moderationResult = await checkContent(comment.comment)
      
      if (moderationResult.isRacist) {
        const carlbotId = await getCarlbotId()
        db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(comment.user_id)
        db.prepare(`
          UPDATE post_comments 
          SET comment = ?, 
              is_deleted = 1,
              deleted_by = 'carlbot',
              deleted_reason = ?
          WHERE id = ?
        `).run('[deleted by carlbot]', `Content moderation: ${moderationResult.reason}`, comment.id)
        
        logBotActivity(db, carlbotId, 'moderation_ban', `Banned user ${comment.user_id} and deleted comment ${comment.id} for racist content`, 'comment', comment.id, true, null, {
          userId: comment.user_id,
          commentId: comment.id,
          postId: comment.post_id,
          reason: moderationResult.reason,
          severity: moderationResult.severity
        })
        
        return res.json({
          action: 'banned_and_deleted',
          userId: comment.user_id,
          commentId: comment.id,
          reason: moderationResult.reason
        })
      } else {
        return res.json({ action: 'approved', commentId: comment.id })
      }
    } else if (type === 'recent') {
      // Check recent content - use the moderation route's batch check
      const moderationRouter = await import('../routes/moderation.js')
      const checkRecent = moderationRouter.default
      // We'll call the internal function directly
      const db = getDatabase()
      const recentPosts = db.prepare(`
        SELECT id, user_id, content 
        FROM social_posts 
        WHERE is_deleted = 0 
          AND created_at > datetime('now', '-1 hour')
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit || 100)
      
      const recentComments = db.prepare(`
        SELECT id, user_id, comment, post_id 
        FROM post_comments 
        WHERE is_deleted = 0 
          AND created_at > datetime('now', '-1 hour')
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit || 100)
      
      const results = { posts: [], comments: [], banned: [] }
      
      // Import checkContent function
      const { checkContent } = await import('../routes/moderation.js')
      
      for (const post of recentPosts) {
        const moderationResult = await checkContent(post.content)
        if (moderationResult.isRacist) {
          const carlbotId = await getCarlbotId()
          db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(post.user_id)
          db.prepare(`
            UPDATE social_posts 
            SET content = ?, 
                user_id = ?,
                is_deleted = 1,
                deleted_by = 'carlbot',
                deleted_reason = ?
            WHERE id = ?
          `).run('[deleted by carlbot]', carlbotId, `Content moderation: ${moderationResult.reason}`, post.id)
          
          logBotActivity(db, carlbotId, 'moderation_ban', `Banned user ${post.user_id} and deleted post ${post.id} for racist content`, 'post', post.id, true, null, {
            userId: post.user_id,
            postId: post.id,
            reason: moderationResult.reason
          })
          
          results.posts.push({ id: post.id, action: 'deleted' })
          results.banned.push(post.user_id)
        }
      }
      
      for (const comment of recentComments) {
        const moderationResult = await checkContent(comment.comment)
        if (moderationResult.isRacist) {
          const carlbotId = await getCarlbotId()
          db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(comment.user_id)
          db.prepare(`
            UPDATE post_comments 
            SET comment = ?, 
                is_deleted = 1,
                deleted_by = 'carlbot',
                deleted_reason = ?
            WHERE id = ?
          `).run('[deleted by carlbot]', `Content moderation: ${moderationResult.reason}`, comment.id)
          
          logBotActivity(db, carlbotId, 'moderation_ban', `Banned user ${comment.user_id} and deleted comment ${comment.id} for racist content`, 'comment', comment.id, true, null, {
            userId: comment.user_id,
            commentId: comment.id,
            reason: moderationResult.reason
          })
          
          results.comments.push({ id: comment.id, action: 'deleted' })
          if (!results.banned.includes(comment.user_id)) {
            results.banned.push(comment.user_id)
          }
        }
      }
      
      return res.json(results)
    } else {
      return res.status(400).json({ error: 'Invalid parameters. Use type: "post", "comment", or "recent" with id or limit' })
    }
  } catch (error) {
    console.error('Manual moderation check error:', error)
    res.status(500).json({ error: 'Failed to run moderation check: ' + error.message })
  }
})

// Get moderation statistics
router.get('/moderation/stats', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    
    const stats = {
      totalBanned: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_banned = 1').get()?.count || 0,
      totalDeletedPosts: db.prepare('SELECT COUNT(*) as count FROM social_posts WHERE is_deleted = 1').get()?.count || 0,
      totalDeletedComments: db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE is_deleted = 1').get()?.count || 0,
      moderationActions24h: db.prepare(`
        SELECT COUNT(*) as count 
        FROM bot_activity_log 
        WHERE action_type LIKE 'moderation_%' 
        AND created_at > datetime('now', '-24 hours')
      `).get()?.count || 0,
      moderationActions7d: db.prepare(`
        SELECT COUNT(*) as count 
        FROM bot_activity_log 
        WHERE action_type LIKE 'moderation_%' 
        AND created_at > datetime('now', '-7 days')
      `).get()?.count || 0,
      bannedToday: db.prepare(`
        SELECT COUNT(*) as count 
        FROM bot_activity_log 
        WHERE action_type = 'moderation_ban' 
        AND created_at > datetime('now', '-24 hours')
      `).get()?.count || 0
    }
    
    res.json(stats)
  } catch (error) {
    console.error('Get moderation stats error:', error)
    res.status(500).json({ error: 'Failed to get moderation stats' })
  }
})

// Get decision logs (detailed AI decision-making)
router.get('/decisions', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { limit = 50, post_id } = req.query
    
    let query = `
      SELECT 
        bal.*,
        u.username as bot_username,
        sp.content as post_content,
        sp.id as post_id,
        sp.user_id as post_author_id
      FROM bot_activity_log bal
      JOIN users u ON bal.bot_user_id = u.id
      LEFT JOIN social_posts sp ON bal.target_type = 'post' AND bal.target_id = sp.id
      WHERE bal.action_type LIKE 'decision_%' OR bal.action_type IN ('like', 'comment', 'retweet')
    `
    const params = []
    
    if (post_id) {
      query += ' AND bal.target_id = ?'
      params.push(parseInt(post_id))
    }
    
    query += ' ORDER BY bal.created_at DESC LIMIT ?'
    params.push(parseInt(limit))
    
    const decisions = db.prepare(query).all(...params)
    
    // Parse metadata for each decision
    const decisionsWithMetadata = decisions.map(decision => {
      let metadata = null
      if (decision.metadata) {
        try {
          metadata = JSON.parse(decision.metadata)
        } catch (e) {
          metadata = { raw: decision.metadata }
        }
      }
      return {
        ...decision,
        parsedMetadata: metadata
      }
    })
    
    res.json(decisionsWithMetadata)
  } catch (error) {
    console.error('Get decisions error:', error)
    res.status(500).json({ error: 'Failed to get decision logs' })
  }
})

// ========== USER MANAGEMENT ==========

// Search users
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { search = '', limit = 50, offset = 0 } = req.query
    
    let query = `
      SELECT 
        u.*,
        up.display_name,
        up.bio,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = u.id) as posts_count,
        (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count,
        us.level,
        us.total_points
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_stats us ON u.id = us.user_id
      WHERE 1=1
    `
    const params = []
    
    if (search) {
      query += ' AND (u.username LIKE ? OR u.email LIKE ? OR up.display_name LIKE ?)'
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }
    
    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), parseInt(offset))
    
    const users = db.prepare(query).all(...params)
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1'
    const countParams = []
    if (search) {
      countQuery += ' AND (username LIKE ? OR email LIKE ?)'
      const searchTerm = `%${search}%`
      countParams.push(searchTerm, searchTerm)
    }
    const total = db.prepare(countQuery).get(...countParams)?.total || 0
    
    res.json({ users, total, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (error) {
    console.error('Search users error:', error)
    res.status(500).json({ error: 'Failed to search users' })
  }
})

// Get user details
router.get('/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    
    const user = db.prepare(`
      SELECT 
        u.*,
        up.*,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = u.id) as posts_count,
        (SELECT COUNT(*) FROM post_comments WHERE user_id = u.id) as comments_count,
        (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count,
        us.*
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_stats us ON u.id = us.user_id
      WHERE u.id = ?
    `).get(userId)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Get recent posts
    const recentPosts = db.prepare(`
      SELECT id, content, created_at, likes_count, comments_count
      FROM social_posts
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(userId)
    
    res.json({ ...user, recentPosts })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

// Ban/unban user (add is_banned column if needed)
router.post('/users/:userId/ban', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    const { reason } = req.body
    
    // Check if user exists
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // For now, we'll add a note in user_profiles settings
    // In production, you'd add an is_banned column to users table
    const profile = db.prepare('SELECT settings FROM user_profiles WHERE user_id = ?').get(userId)
    const settings = profile ? JSON.parse(profile.settings || '{}') : {}
    settings.banned = true
    settings.ban_reason = reason || 'Banned by admin'
    settings.banned_at = new Date().toISOString()
    settings.banned_by = req.admin.username
    
    db.prepare('UPDATE user_profiles SET settings = ? WHERE user_id = ?').run(JSON.stringify(settings), userId)
    
    // Log admin action
    const carlbot = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
    if (carlbot) {
      logBotActivity(
        db,
        carlbot.id,
        'admin_action',
        `Admin ${req.admin.username} banned user ${user.username}`,
        'user',
        userId,
        true,
        null,
        { reason, admin: req.admin.username }
      )
    }
    
    res.json({ success: true, message: `User ${user.username} has been banned` })
  } catch (error) {
    console.error('Ban user error:', error)
    res.status(500).json({ error: 'Failed to ban user' })
  }
})

router.post('/users/:userId/unban', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    
    const profile = db.prepare('SELECT settings FROM user_profiles WHERE user_id = ?').get(userId)
    if (profile) {
      const settings = JSON.parse(profile.settings || '{}')
      settings.banned = false
      db.prepare('UPDATE user_profiles SET settings = ? WHERE user_id = ?').run(JSON.stringify(settings), userId)
    }
    
    res.json({ success: true, message: 'User has been unbanned' })
  } catch (error) {
    console.error('Unban user error:', error)
    res.status(500).json({ error: 'Failed to unban user' })
  }
})

// Delete user
router.delete('/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Delete user (cascade will handle related data)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    
    // Log admin action
    const carlbot = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
    if (carlbot) {
      logBotActivity(
        db,
        carlbot.id,
        'admin_action',
        `Admin ${req.admin.username} deleted user ${user.username}`,
        'user',
        userId,
        true,
        null,
        { admin: req.admin.username }
      )
    }
    
    res.json({ success: true, message: `User ${user.username} has been deleted` })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

// ========== CONTENT MODERATION ==========

// Get reported content (if reports table exists)
router.get('/moderation/posts', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { limit = 50, offset = 0 } = req.query
    
    // Get recent posts with high engagement for review
    const posts = db.prepare(`
      SELECT 
        sp.*,
        u.username,
        u.avatar_url,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count
      FROM social_posts sp
      JOIN users u ON sp.user_id = u.id
      ORDER BY sp.created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), parseInt(offset))
    
    res.json(posts)
  } catch (error) {
    console.error('Get posts error:', error)
    res.status(500).json({ error: 'Failed to get posts' })
  }
})

// Delete post
router.delete('/moderation/posts/:postId', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const postId = parseInt(req.params.postId)
    
    const post = db.prepare('SELECT user_id, content FROM social_posts WHERE id = ?').get(postId)
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    // Delete post (cascade will handle related data)
    db.prepare('DELETE FROM social_posts WHERE id = ?').run(postId)
    
    // Log admin action
    const carlbot = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
    if (carlbot) {
      logBotActivity(
        db,
        carlbot.id,
        'admin_action',
        `Admin ${req.admin.username} deleted post ${postId}`,
        'post',
        postId,
        true,
        null,
        { admin: req.admin.username, content: post.content.substring(0, 50) }
      )
    }
    
    res.json({ success: true, message: 'Post deleted' })
  } catch (error) {
    console.error('Delete post error:', error)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

// Delete comment
router.delete('/moderation/comments/:commentId', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const commentId = parseInt(req.params.commentId)
    
    const comment = db.prepare('SELECT comment FROM post_comments WHERE id = ?').get(commentId)
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' })
    }
    
    db.prepare('DELETE FROM post_comments WHERE id = ?').run(commentId)
    
    res.json({ success: true, message: 'Comment deleted' })
  } catch (error) {
    console.error('Delete comment error:', error)
    res.status(500).json({ error: 'Failed to delete comment' })
  }
})

// ========== SYSTEM HEALTH ==========

// Get system health/stats
router.get('/system/health', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    
    // Database stats
    const dbStats = {
      totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0,
      totalPosts: db.prepare('SELECT COUNT(*) as count FROM social_posts').get()?.count || 0,
      totalComments: db.prepare('SELECT COUNT(*) as count FROM post_comments').get()?.count || 0,
      totalCommunities: db.prepare('SELECT COUNT(*) as count FROM communities').get()?.count || 0,
      totalConversations: db.prepare('SELECT COUNT(*) as count FROM conversations').get()?.count || 0,
      totalAchievements: db.prepare('SELECT COUNT(*) as count FROM achievements').get()?.count || 0
    }
    
    // Recent activity (last 24 hours)
    const recentActivity = {
      newUsers: db.prepare(`
        SELECT COUNT(*) as count FROM users 
        WHERE datetime(created_at) > datetime('now', '-24 hours')
      `).get()?.count || 0,
      newPosts: db.prepare(`
        SELECT COUNT(*) as count FROM social_posts 
        WHERE datetime(created_at) > datetime('now', '-24 hours')
      `).get()?.count || 0,
      newComments: db.prepare(`
        SELECT COUNT(*) as count FROM post_comments 
        WHERE datetime(created_at) > datetime('now', '-24 hours')
      `).get()?.count || 0
    }
    
    // Top users
    const topUsers = db.prepare(`
      SELECT 
        u.username,
        u.id,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = u.id) as posts,
        (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers
      FROM users u
      ORDER BY (SELECT COUNT(*) FROM social_posts WHERE user_id = u.id) DESC
      LIMIT 10
    `).all()
    
    // Database size (approximate)
    const dbSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get()
    
    res.json({
      database: dbStats,
      recentActivity,
      topUsers,
      dbSize: dbSize?.size || 0,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get system health error:', error)
    res.status(500).json({ error: 'Failed to get system health' })
  }
})

// ========== ACHIEVEMENT MANAGEMENT ==========

// Get all achievements
router.get('/achievements', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const achievements = db.prepare('SELECT * FROM achievements ORDER BY category, requirement_value').all()
    
    // Get stats for each achievement
    const achievementsWithStats = achievements.map(ach => {
      const earnedCount = db.prepare(`
        SELECT COUNT(*) as count FROM user_achievements WHERE achievement_id = ?
      `).get(ach.id)?.count || 0
      
      return {
        ...ach,
        earned_count: earnedCount
      }
    })
    
    res.json(achievementsWithStats)
  } catch (error) {
    console.error('Get achievements error:', error)
    res.status(500).json({ error: 'Failed to get achievements' })
  }
})

// Create achievement
router.post('/achievements', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const { code, name, description, icon, category, requirement_type, requirement_value, points, rarity } = req.body
    
    if (!code || !name || !requirement_type || !requirement_value) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    const result = db.prepare(`
      INSERT INTO achievements (code, name, description, icon, category, requirement_type, requirement_value, points, rarity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, name, description, icon || '🏆', category || 'general', requirement_type, requirement_value, points || 0, rarity || 'common')
    
    res.json({ success: true, achievementId: result.lastInsertRowid })
  } catch (error) {
    console.error('Create achievement error:', error)
    res.status(500).json({ error: 'Failed to create achievement' })
  }
})

// Update achievement
router.put('/achievements/:achievementId', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const achievementId = parseInt(req.params.achievementId)
    const { name, description, icon, points, rarity } = req.body
    
    db.prepare(`
      UPDATE achievements 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          icon = COALESCE(?, icon),
          points = COALESCE(?, points),
          rarity = COALESCE(?, rarity)
      WHERE id = ?
    `).run(name, description, icon, points, rarity, achievementId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Update achievement error:', error)
    res.status(500).json({ error: 'Failed to update achievement' })
  }
})

// Delete achievement
router.delete('/achievements/:achievementId', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    const achievementId = parseInt(req.params.achievementId)
    
    db.prepare('DELETE FROM achievements WHERE id = ?').run(achievementId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Delete achievement error:', error)
    res.status(500).json({ error: 'Failed to delete achievement' })
  }
})

// ========== ANALYTICS OVERVIEW ==========

// Get platform-wide analytics
router.get('/analytics/overview', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    
    // User growth over time
    const userGrowth = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users
      WHERE datetime(created_at) > datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all()
    
    // Post growth over time
    const postGrowth = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_posts
      FROM social_posts
      WHERE datetime(created_at) > datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all()
    
    // Engagement trends
    const engagementTrends = db.prepare(`
      SELECT 
        DATE(sp.created_at) as date,
        COUNT(DISTINCT sp.id) as posts,
        COUNT(DISTINCT pl.id) as likes,
        COUNT(DISTINCT pc.id) as comments
      FROM social_posts sp
      LEFT JOIN post_likes pl ON sp.id = pl.post_id
      LEFT JOIN post_comments pc ON sp.id = pc.post_id
      WHERE datetime(sp.created_at) > datetime('now', '-30 days')
      GROUP BY DATE(sp.created_at)
      ORDER BY date ASC
    `).all()
    
    // Top games
    const topGames = db.prepare(`
      SELECT 
        g.name,
        g.icon,
        COUNT(sp.id) as post_count
      FROM games g
      JOIN social_posts sp ON g.id = sp.game_id
      GROUP BY g.id
      ORDER BY post_count DESC
      LIMIT 10
    `).all()
    
    res.json({
      userGrowth,
      postGrowth,
      engagementTrends,
      topGames
    })
  } catch (error) {
    console.error('Get analytics overview error:', error)
    res.status(500).json({ error: 'Failed to get analytics overview' })
  }
})

// ========== VISUAL SQL QUERY BUILDER ==========

// Get database schema (tables and columns)
router.get('/database/schema', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    
    // Get all tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all()
    
    // Get columns for each table
    const schema = {}
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all()
      schema[table.name] = columns.map(col => ({
        name: col.name,
        type: col.type,
        notnull: col.notnull === 1,
        dflt_value: col.dflt_value,
        pk: col.pk === 1
      }))
    }
    
    res.json({ tables: tables.map(t => t.name), schema })
  } catch (error) {
    console.error('Get schema error:', error)
    res.status(500).json({ error: 'Failed to get database schema' })
  }
})

// Execute safe query (SELECT only, with limits)
router.post('/database/query', authenticateAdmin, async (req, res) => {
  try {
    const { table, columns, filters, orderBy, limit: queryLimit, joins } = req.body
    
    if (!table) {
      return res.status(400).json({ error: 'Table is required' })
    }
    
    const db = getDatabase()
    const limit = Math.min(queryLimit || 100, 1000) // Max 1000 rows
    
    // Build SELECT clause
    const selectCols = columns && columns.length > 0 
      ? columns.map(col => {
          // Handle joins: table.column
          if (col.includes('.')) {
            return col
          }
          return `${table}.${col}`
        }).join(', ')
      : `${table}.*`
    
    // Build FROM clause with joins
    let fromClause = table
    if (joins && joins.length > 0) {
      for (const join of joins) {
        const joinType = join.type || 'LEFT'
        fromClause += ` ${joinType} JOIN ${join.table} ON ${join.on}`
      }
    }
    
    // Build WHERE clause
    let whereClause = ''
    const params = []
    if (filters && filters.length > 0) {
      const conditions = filters.map((filter, idx) => {
        const { column, operator, value } = filter
        
        // Handle operators
        switch (operator) {
          case 'equals': 
            params.push(value)
            return `${column} = ?`
          case 'not_equals': 
            params.push(value)
            return `${column} != ?`
          case 'contains': 
            params.push(`%${value}%`)
            return `${column} LIKE ?`
          case 'starts_with': 
            params.push(`${value}%`)
            return `${column} LIKE ?`
          case 'ends_with': 
            params.push(`%${value}`)
            return `${column} LIKE ?`
          case 'greater_than': 
            params.push(value)
            return `${column} > ?`
          case 'less_than': 
            params.push(value)
            return `${column} < ?`
          case 'greater_equal': 
            params.push(value)
            return `${column} >= ?`
          case 'less_equal': 
            params.push(value)
            return `${column} <= ?`
          case 'is_null': 
            return `${column} IS NULL`
          case 'is_not_null': 
            return `${column} IS NOT NULL`
          default: 
            params.push(value)
            return `${column} = ?`
        }
      })
      whereClause = 'WHERE ' + conditions.join(' AND ')
    }
    
    // Build ORDER BY clause
    let orderClause = ''
    if (orderBy && orderBy.column) {
      orderClause = `ORDER BY ${orderBy.column} ${orderBy.direction || 'ASC'}`
    }
    
    // Build final query
    const query = `SELECT ${selectCols} FROM ${fromClause} ${whereClause} ${orderClause} LIMIT ?`
    params.push(limit)
    
    console.log('Executing query:', query)
    console.log('With params:', params)
    
    const results = db.prepare(query).all(...params)
    
    res.json({
      success: true,
      results,
      count: results.length,
      query: query.replace(/\?/g, (_, idx) => {
        const val = params[idx]
        return typeof val === 'string' ? `'${val}'` : val
      })
    })
  } catch (error) {
    console.error('Query execution error:', error)
    res.status(500).json({ 
      error: 'Query execution failed', 
      details: error.message 
    })
  }
})

// Get table row count
router.get('/database/table/:tableName/count', authenticateAdmin, async (req, res) => {
  try {
    const { tableName } = req.params
    const db = getDatabase()
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get()
    res.json({ count: result.count })
  } catch (error) {
    console.error('Get table count error:', error)
    res.status(500).json({ error: 'Failed to get table count' })
  }
})

// ========== FEATURE MANAGEMENT ==========

// Get all features
router.get('/features', authenticateAdmin, async (req, res) => {
  try {
    const db = getDatabase()
    
    // Check if feature_flags table exists, create if not
    try {
      db.prepare('SELECT 1 FROM feature_flags LIMIT 1').get()
    } catch {
      // Table doesn't exist, create it
      db.prepare(`
        CREATE TABLE IF NOT EXISTS feature_flags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feature_key TEXT UNIQUE NOT NULL,
          feature_name TEXT NOT NULL,
          description TEXT,
          is_enabled INTEGER DEFAULT 0,
          config TEXT, -- JSON object for feature-specific config
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
      
      // Insert default features
      const defaultFeatures = [
        { key: 'social_feed', name: 'Social Feed', description: 'Enable social media feed functionality', enabled: 1 },
        { key: 'achievements', name: 'Achievements System', description: 'Enable achievements and gamification', enabled: 1 },
        { key: 'communities', name: 'Communities', description: 'Enable community features', enabled: 1 },
        { key: 'direct_messages', name: 'Direct Messages', description: 'Enable private messaging', enabled: 1 },
        { key: 'notifications', name: 'Notifications', description: 'Enable push notifications', enabled: 1 },
        { key: 'analytics', name: 'User Analytics', description: 'Enable user analytics dashboard', enabled: 1 },
        { key: 'trending_topics', name: 'Trending Topics', description: 'Enable AI-powered trending topics', enabled: 1 },
        { key: 'build_analysis', name: 'Build Analysis', description: 'Enable gaming build analysis feature', enabled: 1 },
        { key: 'image_analysis', name: 'Image Analysis', description: 'Enable image/chart analysis', enabled: 1 },
        { key: 'carlbot_auto_interact', name: 'Carlbot Auto-Interact', description: 'Enable Carlbot automatic interactions', enabled: 1 }
      ]
      
      for (const feature of defaultFeatures) {
        try {
          db.prepare(`
            INSERT INTO feature_flags (feature_key, feature_name, description, is_enabled)
            VALUES (?, ?, ?, ?)
          `).run(feature.key, feature.name, feature.description, feature.enabled)
        } catch (e) {
          // Feature already exists, skip
        }
      }
    }
    
    const features = db.prepare('SELECT * FROM feature_flags ORDER BY feature_name').all()
    
    res.json(features.map(f => ({
      ...f,
      is_enabled: f.is_enabled === 1,
      config: f.config ? JSON.parse(f.config) : {}
    })))
  } catch (error) {
    console.error('Get features error:', error)
    res.status(500).json({ error: 'Failed to get features' })
  }
})

// Toggle feature
router.put('/features/:featureKey/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { featureKey } = req.params
    const { enabled } = req.body
    const db = getDatabase()
    
    db.prepare(`
      UPDATE feature_flags 
      SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE feature_key = ?
    `).run(enabled ? 1 : 0, featureKey)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Toggle feature error:', error)
    res.status(500).json({ error: 'Failed to toggle feature' })
  }
})

// Update feature config
router.put('/features/:featureKey/config', authenticateAdmin, async (req, res) => {
  try {
    const { featureKey } = req.params
    const { config } = req.body
    const db = getDatabase()
    
    db.prepare(`
      UPDATE feature_flags 
      SET config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE feature_key = ?
    `).run(JSON.stringify(config), featureKey)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Update feature config error:', error)
    res.status(500).json({ error: 'Failed to update feature config' })
  }
})

// Create new feature
router.post('/features', authenticateAdmin, async (req, res) => {
  try {
    const { feature_key, feature_name, description, is_enabled, config } = req.body
    const db = getDatabase()
    
    if (!feature_key || !feature_name) {
      return res.status(400).json({ error: 'Feature key and name are required' })
    }
    
    const result = db.prepare(`
      INSERT INTO feature_flags (feature_key, feature_name, description, is_enabled, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      feature_key,
      feature_name,
      description || '',
      is_enabled ? 1 : 0,
      config ? JSON.stringify(config) : null
    )
    
    res.json({ success: true, featureId: result.lastInsertRowid })
  } catch (error) {
    console.error('Create feature error:', error)
    res.status(500).json({ error: 'Failed to create feature' })
  }
})

// Delete feature
router.delete('/features/:featureKey', authenticateAdmin, async (req, res) => {
  try {
    const { featureKey } = req.params
    const db = getDatabase()
    
    db.prepare('DELETE FROM feature_flags WHERE feature_key = ?').run(featureKey)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Delete feature error:', error)
    res.status(500).json({ error: 'Failed to delete feature' })
  }
})

export default router
