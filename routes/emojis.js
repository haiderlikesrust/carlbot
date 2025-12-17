import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Configure multer for emoji uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/emojis/')
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, `emoji-${uniqueSuffix}${path.extname(file.originalname)}`)
  }
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 256 * 1024 }, // 256KB limit for emojis
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only PNG, JPEG, GIF, and WebP images are allowed'))
    }
  }
})

// Helper function to get full emoji URL
function getFullEmojiUrl(emojiUrl) {
  if (!emojiUrl || emojiUrl === '') return null
  if (emojiUrl.startsWith('http://') || emojiUrl.startsWith('https://')) return emojiUrl
  const baseUrl = process.env.CLIENT_URL?.replace(':5173', ':3000') || 'http://localhost:3000'
  return `${baseUrl}${emojiUrl.startsWith('/') ? '' : '/'}${emojiUrl}`
}

// Get emojis for a server
router.get('/server/:serverId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params

    const emojis = db.prepare(`
      SELECT 
        e.*,
        u.username as created_by_username
      FROM custom_emojis e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.server_id = ?
      ORDER BY e.name ASC
    `).all(serverId)

    // Convert URLs to full URLs
    emojis.forEach(emoji => {
      if (emoji.url) {
        emoji.url = getFullEmojiUrl(emoji.url)
      }
    })

    res.json({ emojis })
  } catch (error) {
    console.error('Get emojis error:', error)
    res.status(500).json({ error: 'Failed to get emojis' })
  }
})

// Create custom emoji
router.post('/server/:serverId', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const db = getDatabase()
    const { serverId } = req.params
    const userId = req.user.id
    const { name } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Emoji name is required' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Emoji image is required' })
    }

    // Check if user has permission (server owner or admin)
    const server = db.prepare('SELECT owner_id FROM communities WHERE id = ?').get(serverId)
    if (!server) {
      return res.status(404).json({ error: 'Server not found' })
    }

    const isOwner = server.owner_id === userId
    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(serverId, userId)
    const isAdmin = member?.role === 'admin'

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Check if emoji name already exists in server
    const existing = db.prepare(`
      SELECT id FROM custom_emojis 
      WHERE server_id = ? AND LOWER(name) = LOWER(?)
    `).get(serverId, name.trim())

    if (existing) {
      return res.status(400).json({ error: 'Emoji name already exists in this server' })
    }

    const emojiUrl = `/uploads/emojis/${req.file.filename}`

    const result = db.prepare(`
      INSERT INTO custom_emojis (server_id, name, url, created_by, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(serverId, name.trim(), emojiUrl, userId)

    const emoji = db.prepare(`
      SELECT 
        e.*,
        u.username as created_by_username
      FROM custom_emojis e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(result.lastInsertRowid)

    if (emoji.url) {
      emoji.url = getFullEmojiUrl(emoji.url)
    }

    res.status(201).json({ emoji })
  } catch (error) {
    console.error('Create emoji error:', error)
    res.status(500).json({ error: 'Failed to create emoji' })
  }
})

// Delete custom emoji
router.delete('/:emojiId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { emojiId } = req.params
    const userId = req.user.id

    const emoji = db.prepare(`
      SELECT e.*, s.owner_id
      FROM custom_emojis e
      JOIN communities s ON e.server_id = s.id
      WHERE e.id = ?
    `).get(emojiId)

    if (!emoji) {
      return res.status(404).json({ error: 'Emoji not found' })
    }

    // Check permissions
    const isOwner = emoji.owner_id === userId
    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(emoji.server_id, userId)
    const isAdmin = member?.role === 'admin'

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare('DELETE FROM custom_emojis WHERE id = ?').run(emojiId)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete emoji error:', error)
    res.status(500).json({ error: 'Failed to delete emoji' })
  }
})

export default router
