import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { emitMessage, emitMessageUpdate, emitMessageDelete } from '../utils/socketEvents.js'
import { parseEmbeds, generateEmbed } from '../utils/embeds.js'
import { processCarlcordMessage } from './carlcord-bot.js'

const router = express.Router()

// Helper function to get full avatar URL
function getFullAvatarUrl(avatarUrl) {
  if (!avatarUrl || avatarUrl === '') return null
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl
  const baseUrl = process.env.CLIENT_URL?.replace(':5173', ':3000') || 'http://localhost:3000'
  return `${baseUrl}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`
}

// Get messages for a channel
router.get('/channel/:channelId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { channelId } = req.params
    const { limit = 50, before, after } = req.query
    const userId = req.user?.id

    let query = `
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status,
        (SELECT COUNT(*) FROM message_reactions WHERE message_id = m.id) as reaction_count,
        (SELECT COUNT(*) FROM pinned_messages WHERE message_id = m.id) as is_pinned
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE m.channel_id = ?
    `
    const params = [channelId]

    if (before) {
      query += ' AND m.id < ?'
      params.push(before)
    }
    if (after) {
      query += ' AND m.id > ?'
      params.push(after)
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?'
    params.push(parseInt(limit))

    const messages = db.prepare(query).all(...params)

    // Reverse to show oldest first
    messages.reverse()

    // Convert avatar URLs to full URLs
    messages.forEach(message => {
      if (message.avatar_url) {
        message.avatar_url = getFullAvatarUrl(message.avatar_url)
      }
    })

    // Get reactions for each message
    for (const message of messages) {
      const reactions = db.prepare(`
        SELECT 
          mr.*,
          (SELECT COUNT(*) FROM reaction_users WHERE reaction_id = mr.id) as user_count,
          (SELECT GROUP_CONCAT(user_id) FROM reaction_users WHERE reaction_id = mr.id) as user_ids
        FROM message_reactions mr
        WHERE mr.message_id = ?
      `).all(message.id)

      message.reactions = reactions.map(r => ({
        emoji_name: r.emoji_name,
        emoji_id: r.emoji_id,
        emoji_animated: r.emoji_animated,
        count: r.user_count,
        me: userId ? r.user_ids?.split(',').includes(String(userId)) : false
      }))
    }

    res.json({ messages })
  } catch (error) {
    console.error('Get messages error:', error)
    res.status(500).json({ error: 'Failed to get messages' })
  }
})

// Get message by ID
router.get('/:messageId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId } = req.params

    const message = db.prepare(`
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE m.id = ?
    `).get(messageId)

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    // Convert avatar_url to full URL
    if (message.avatar_url) {
      message.avatar_url = getFullAvatarUrl(message.avatar_url)
    }

    res.json({ message })
  } catch (error) {
    console.error('Get message error:', error)
    res.status(500).json({ error: 'Failed to get message' })
  }
})

// Send message
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { 
      channel_id, 
      content, 
      nonce,
      tts = 0,
      attachments,
      embeds,
      referenced_message_id
    } = req.body

    if (!channel_id) {
      return res.status(400).json({ error: 'Channel ID is required' })
    }

    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message content or attachments required' })
    }

    // Check if user has access to channel
    const channel = db.prepare(`
      SELECT c.*, s.id as server_id
      FROM channels c
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE c.id = ?
    `).get(channel_id)

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' })
    }

    // Check slow mode
    if (channel.rate_limit_per_user > 0) {
      const lastMessage = db.prepare(`
        SELECT created_at FROM channel_messages
        WHERE channel_id = ? AND user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(channel_id, userId)

      if (lastMessage) {
        const lastMsgTime = new Date(lastMessage.created_at).getTime()
        const now = Date.now()
        const timeSince = (now - lastMsgTime) / 1000

        if (timeSince < channel.rate_limit_per_user) {
          const waitTime = Math.ceil(channel.rate_limit_per_user - timeSince)
          return res.status(429).json({ 
            error: 'Slow mode active', 
            retry_after: waitTime 
          })
        }
      }
    }

    // Parse mentions
    let mentions = []
    let mentionRoles = []
    let mentionEveryone = 0

    if (content) {
      // Extract @mentions
      const mentionRegex = /<@!?(\d+)>/g
      const matches = content.matchAll(mentionRegex)
      mentions = Array.from(matches, m => parseInt(m[1]))

      // Extract @role mentions
      const roleMentionRegex = /<@&(\d+)>/g
      const roleMatches = content.matchAll(roleMentionRegex)
      mentionRoles = Array.from(roleMatches, m => parseInt(m[1]))

      // Check for @everyone
      if (content.includes('@everyone')) {
        mentionEveryone = 1
      }
    }

    // Generate embeds from URLs
    let embedsArray = []
    if (content) {
      const embedUrls = parseEmbeds(content)
      for (const embedUrl of embedUrls.slice(0, 10)) { // Limit to 10 embeds
        const embed = await generateEmbed(embedUrl.url)
        if (embed) {
          embedsArray.push(embed)
        }
      }
    }

    // Use provided embeds or generated ones
    const finalEmbeds = embeds ? (Array.isArray(embeds) ? embeds : [embeds]) : (embedsArray.length > 0 ? embedsArray : null)

    const result = db.prepare(`
      INSERT INTO channel_messages (
        channel_id, user_id, content, nonce, tts, mention_everyone,
        attachments, embeds, mentions, mention_roles, referenced_message_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      channel_id, userId, content || null, nonce || null, tts, mentionEveryone,
      attachments ? JSON.stringify(attachments) : null,
      finalEmbeds ? JSON.stringify(finalEmbeds) : null,
      mentions.length > 0 ? JSON.stringify(mentions) : null,
      mentionRoles.length > 0 ? JSON.stringify(mentionRoles) : null,
      referenced_message_id || null
    )

    const messageId = result.lastInsertRowid

    // Get full message with user info
    const message = db.prepare(`
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE m.id = ?
    `).get(messageId)

    // Convert avatar_url to full URL
    if (message.avatar_url) {
      message.avatar_url = getFullAvatarUrl(message.avatar_url)
    }

    // Emit real-time event
    emitMessage(message)

    // Create notifications for mentions
    if (mentions.length > 0 || mentionRoles.length > 0 || mentionEveryone) {
      const { createNotification } = await import('./notifications.js')
      
      // Notify mentioned users
      for (const mentionedUserId of mentions) {
        if (mentionedUserId !== userId) { // Don't notify yourself
          createNotification(mentionedUserId, 'mention', userId, {
            messageId: messageId,
            content: content?.substring(0, 100) || '',
            channelId: channel_id,
            serverId: channel.server_id
          }).catch(err => console.error('Failed to create mention notification:', err))
        }
      }
      
      // Notify role members (if @role or @everyone)
      if (mentionEveryone || mentionRoles.length > 0) {
        const db = getDatabase()
        let roleMemberIds = []
        
        if (mentionEveryone) {
          // Get all server members
          const allMembers = db.prepare(`
            SELECT user_id FROM community_members 
            WHERE community_id = ? AND user_id != ?
          `).all(channel.server_id, userId)
          roleMemberIds = allMembers.map(m => m.user_id)
        } else {
          // Get members with mentioned roles
          for (const roleId of mentionRoles) {
            const roleMembers = db.prepare(`
              SELECT user_id FROM server_role_members 
              WHERE role_id = ? AND user_id != ?
            `).all(roleId, userId)
            roleMemberIds.push(...roleMembers.map(m => m.user_id))
          }
        }
        
        // Remove duplicates
        roleMemberIds = [...new Set(roleMemberIds)]
        
        // Create notifications
        for (const memberId of roleMemberIds) {
          createNotification(memberId, 'mention', userId, {
            messageId: messageId,
            content: content?.substring(0, 100) || '',
            channelId: channel_id,
            serverId: channel.server_id,
            isEveryone: mentionEveryone ? 1 : 0
          }).catch(err => console.error('Failed to create role mention notification:', err))
        }
      }
    }

    // Process bot response asynchronously (don't block the response)
    if (content) {
      processCarlcordMessage(messageId, channel_id, channel.server_id, userId, content)
        .catch(error => {
          console.error('Error processing bot message:', error)
        })
    }

    res.status(201).json({ message })
  } catch (error) {
    console.error('Send message error:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Edit message
router.put('/:messageId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId } = req.params
    const userId = req.user.id
    const { content, attachments, embeds } = req.body

    const message = db.prepare('SELECT * FROM channel_messages WHERE id = ?').get(messageId)

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    if (message.user_id !== userId) {
      return res.status(403).json({ error: 'You can only edit your own messages' })
    }

    const updates = []
    const params = []

    if (content !== undefined) {
      updates.push('content = ?')
      params.push(content)
    }
    if (attachments !== undefined) {
      updates.push('attachments = ?')
      params.push(attachments ? JSON.stringify(attachments) : null)
    }
    if (embeds !== undefined) {
      updates.push('embeds = ?')
      params.push(embeds ? JSON.stringify(embeds) : null)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push('edited_at = CURRENT_TIMESTAMP')
    params.push(messageId)

    db.prepare(`
      UPDATE channel_messages 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)

    const updatedMessage = db.prepare(`
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status
      FROM channel_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE m.id = ?
    `).get(messageId)

    // Convert avatar_url to full URL
    if (updatedMessage.avatar_url) {
      updatedMessage.avatar_url = getFullAvatarUrl(updatedMessage.avatar_url)
    }

    // Emit real-time event
    emitMessageUpdate(updatedMessage)

    res.json({ message: updatedMessage })
  } catch (error) {
    console.error('Edit message error:', error)
    res.status(500).json({ error: 'Failed to edit message' })
  }
})

// Delete message
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId } = req.params
    const userId = req.user.id

    const message = db.prepare(`
      SELECT m.*, c.server_id, s.owner_id
      FROM channel_messages m
      JOIN channels c ON m.channel_id = c.id
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE m.id = ?
    `).get(messageId)

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    // Check permissions (owner, message author, or admin)
    const isOwner = message.user_id === userId
    const isServerOwner = message.server_id && message.owner_id === userId
    let isAdmin = false

    if (message.server_id) {
      const member = db.prepare(`
        SELECT role FROM community_members 
        WHERE community_id = ? AND user_id = ?
      `).get(message.server_id, userId)
      isAdmin = member?.role === 'admin'
    }

    if (!isOwner && !isServerOwner && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare('DELETE FROM channel_messages WHERE id = ?').run(messageId)

    // Emit real-time event
    emitMessageDelete(message.channel_id, messageId)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete message error:', error)
    res.status(500).json({ error: 'Failed to delete message' })
  }
})

// Pin message
router.post('/:messageId/pin', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId } = req.params
    const userId = req.user.id

    const message = db.prepare(`
      SELECT m.*, c.server_id, s.owner_id
      FROM channel_messages m
      JOIN channels c ON m.channel_id = c.id
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE m.id = ?
    `).get(messageId)

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    // Check permissions
    const isServerOwner = message.server_id && message.owner_id === userId
    let isAdmin = false

    if (message.server_id) {
      const member = db.prepare(`
        SELECT role FROM community_members 
        WHERE community_id = ? AND user_id = ?
      `).get(message.server_id, userId)
      isAdmin = member?.role === 'admin'
    }

    if (!isServerOwner && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Check if already pinned
    const existing = db.prepare(`
      SELECT id FROM pinned_messages 
      WHERE channel_id = ? AND message_id = ?
    `).get(message.channel_id, messageId)

    if (existing) {
      return res.json({ success: true, message: 'Already pinned' })
    }

    db.prepare(`
      INSERT INTO pinned_messages (channel_id, message_id, pinned_by, pinned_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(message.channel_id, messageId, userId)

    db.prepare('UPDATE channel_messages SET pinned = 1 WHERE id = ?').run(messageId)

    res.json({ success: true })
  } catch (error) {
    console.error('Pin message error:', error)
    res.status(500).json({ error: 'Failed to pin message' })
  }
})

// Get pinned messages for a channel
router.get('/channel/:channelId/pinned', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { channelId } = req.params

    const messages = db.prepare(`
      SELECT 
        m.*,
        u.username,
        u.avatar_url,
        up.display_name,
        uas.status as user_status,
        pm.pinned_at,
        pm.pinned_by
      FROM pinned_messages pm
      JOIN channel_messages m ON pm.message_id = m.id
      JOIN users u ON m.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_activity_status uas ON u.id = uas.user_id
      WHERE pm.channel_id = ?
      ORDER BY pm.pinned_at DESC
    `).all(channelId)

    // Convert avatar URLs to full URLs
    messages.forEach(message => {
      if (message.avatar_url) {
        message.avatar_url = getFullAvatarUrl(message.avatar_url)
      }
    })

    res.json({ messages })
  } catch (error) {
    console.error('Get pinned messages error:', error)
    res.status(500).json({ error: 'Failed to get pinned messages' })
  }
})

// Unpin message
router.delete('/:messageId/pin', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId } = req.params
    const userId = req.user.id

    const message = db.prepare(`
      SELECT m.*, c.server_id, s.owner_id
      FROM channel_messages m
      JOIN channels c ON m.channel_id = c.id
      LEFT JOIN communities s ON c.server_id = s.id
      WHERE m.id = ?
    `).get(messageId)

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    // Check permissions
    const isServerOwner = message.server_id && message.owner_id === userId
    let isAdmin = false

    if (message.server_id) {
      const member = db.prepare(`
        SELECT role FROM community_members 
        WHERE community_id = ? AND user_id = ?
      `).get(message.server_id, userId)
      isAdmin = member?.role === 'admin'
    }

    if (!isServerOwner && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare(`
      DELETE FROM pinned_messages 
      WHERE channel_id = ? AND message_id = ?
    `).run(message.channel_id, messageId)

    db.prepare('UPDATE channel_messages SET pinned = 0 WHERE id = ?').run(messageId)

    res.json({ success: true })
  } catch (error) {
    console.error('Unpin message error:', error)
    res.status(500).json({ error: 'Failed to unpin message' })
  }
})

export default router
