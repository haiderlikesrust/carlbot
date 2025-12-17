import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Add reaction to message
router.post('/:messageId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId } = req.params
    const userId = req.user.id
    const { emoji_name, emoji_id, emoji_animated = 0 } = req.body

    if (!emoji_name) {
      return res.status(400).json({ error: 'Emoji name is required' })
    }

    // Check if message exists
    const message = db.prepare('SELECT * FROM channel_messages WHERE id = ?').get(messageId)
    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    // Find or create reaction
    let reaction = db.prepare(`
      SELECT * FROM message_reactions 
      WHERE message_id = ? AND emoji_name = ? AND (emoji_id = ? OR (emoji_id IS NULL AND ? IS NULL))
    `).get(messageId, emoji_name, emoji_id || null, emoji_id || null)

    if (!reaction) {
      // Create new reaction
      const result = db.prepare(`
        INSERT INTO message_reactions (message_id, emoji_name, emoji_id, emoji_animated, count)
        VALUES (?, ?, ?, ?, 1)
      `).run(messageId, emoji_name, emoji_id || null, emoji_animated)
      reaction = { id: result.lastInsertRowid, message_id: messageId, emoji_name, emoji_id, emoji_animated, count: 1 }
    }

    // Check if user already reacted
    const existingReaction = db.prepare(`
      SELECT id FROM reaction_users 
      WHERE reaction_id = ? AND user_id = ?
    `).get(reaction.id, userId)

    if (existingReaction) {
      return res.json({ success: true, message: 'Already reacted', reaction })
    }

    // Add user to reaction
    db.prepare(`
      INSERT INTO reaction_users (reaction_id, user_id)
      VALUES (?, ?)
    `).run(reaction.id, userId)

    // Update reaction count
    db.prepare(`
      UPDATE message_reactions 
      SET count = count + 1 
      WHERE id = ?
    `).run(reaction.id)

    const updatedReaction = db.prepare('SELECT * FROM message_reactions WHERE id = ?').get(reaction.id)
    
    // Emit real-time event
    const { emitReaction } = await import('../utils/socketEvents.js')
    emitReaction(message.channel_id, { messageId, reaction: updatedReaction })

    res.json({ success: true, reaction: updatedReaction })
  } catch (error) {
    console.error('Add reaction error:', error)
    res.status(500).json({ error: 'Failed to add reaction' })
  }
})

// Remove reaction from message
router.delete('/:messageId/:emojiName', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId, emojiName } = req.params
    const userId = req.user.id

    // Find reaction
    const reaction = db.prepare(`
      SELECT * FROM message_reactions 
      WHERE message_id = ? AND emoji_name = ?
    `).get(messageId, emojiName)

    if (!reaction) {
      return res.status(404).json({ error: 'Reaction not found' })
    }

    // Check if user reacted
    const userReaction = db.prepare(`
      SELECT id FROM reaction_users 
      WHERE reaction_id = ? AND user_id = ?
    `).get(reaction.id, userId)

    if (!userReaction) {
      return res.status(400).json({ error: 'You have not reacted to this message' })
    }

    // Remove user from reaction
    db.prepare(`
      DELETE FROM reaction_users 
      WHERE reaction_id = ? AND user_id = ?
    `).run(reaction.id, userId)

    // Update reaction count
    const newCount = reaction.count - 1
    if (newCount <= 0) {
      // Delete reaction if no users left
      db.prepare('DELETE FROM message_reactions WHERE id = ?').run(reaction.id)
    } else {
      db.prepare('UPDATE message_reactions SET count = ? WHERE id = ?').run(newCount, reaction.id)
    }

    // Emit real-time event
    const { emitReactionRemove } = await import('../utils/socketEvents.js')
    const message = db.prepare('SELECT channel_id FROM channel_messages WHERE id = ?').get(messageId)
    if (message) {
      emitReactionRemove(message.channel_id, { messageId, emoji_name: emojiName })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Remove reaction error:', error)
    res.status(500).json({ error: 'Failed to remove reaction' })
  }
})

// Get reactions for a message
router.get('/:messageId', async (req, res) => {
  try {
    const db = getDatabase()
    const { messageId } = req.params
    const userId = req.user?.id

    const reactions = db.prepare(`
      SELECT 
        mr.*,
        (SELECT COUNT(*) FROM reaction_users WHERE reaction_id = mr.id) as user_count,
        GROUP_CONCAT(ru.user_id) as user_ids
      FROM message_reactions mr
      LEFT JOIN reaction_users ru ON mr.id = ru.reaction_id
      WHERE mr.message_id = ?
      GROUP BY mr.id
    `).all(messageId)

    const formattedReactions = reactions.map(r => ({
      emoji_name: r.emoji_name,
      emoji_id: r.emoji_id,
      emoji_animated: r.emoji_animated,
      count: r.user_count,
      me: userId ? (r.user_ids?.split(',') || []).includes(String(userId)) : false
    }))

    res.json({ reactions: formattedReactions })
  } catch (error) {
    console.error('Get reactions error:', error)
    res.status(500).json({ error: 'Failed to get reactions' })
  }
})

export default router
