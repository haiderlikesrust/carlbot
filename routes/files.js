import express from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'
import { emitMessage } from '../utils/socketEvents.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'discord'))
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 25 * 1024 * 1024 // 25MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, audio, documents
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mp3|wav|ogg|pdf|doc|docx|txt|zip|rar/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    
    if (extname && mimetype) {
      return cb(null, true)
    } else {
      cb(new Error('File type not allowed'))
    }
  }
})

// Upload file
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { channel_id, message_id } = req.body

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const fileUrl = `/uploads/discord/${req.file.filename}`
    const proxyUrl = fileUrl // In production, use CDN URL

    // Get file dimensions if image
    let width = null
    let height = null
    if (req.file.mimetype.startsWith('image/')) {
      try {
        const sharp = await import('sharp')
        const metadata = await sharp.default(req.file.path).metadata()
        width = metadata.width
        height = metadata.height
      } catch (error) {
        // Sharp not available, skip dimensions
      }
    }

    const result = db.prepare(`
      INSERT INTO file_attachments (
        message_id, user_id, filename, content_type, size, 
        url, proxy_url, width, height, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      message_id || null,
      userId,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      fileUrl,
      proxyUrl,
      width,
      height
    )

    const attachment = {
      id: result.lastInsertRowid,
      filename: req.file.originalname,
      content_type: req.file.mimetype,
      size: req.file.size,
      url: fileUrl,
      proxy_url: proxyUrl,
      width,
      height
    }

    res.json({ attachment })
  } catch (error) {
    console.error('File upload error:', error)
    res.status(500).json({ error: 'Failed to upload file' })
  }
})

// Get file attachment
router.get('/:attachmentId', async (req, res) => {
  try {
    const db = getDatabase()
    const { attachmentId } = req.params

    const attachment = db.prepare(`
      SELECT * FROM file_attachments WHERE id = ?
    `).get(attachmentId)

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' })
    }

    res.json({ attachment })
  } catch (error) {
    console.error('Get attachment error:', error)
    res.status(500).json({ error: 'Failed to get attachment' })
  }
})

// Delete file attachment
router.delete('/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { attachmentId } = req.params
    const userId = req.user.id

    const attachment = db.prepare(`
      SELECT * FROM file_attachments WHERE id = ?
    `).get(attachmentId)

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' })
    }

    if (attachment.user_id !== userId) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Delete file from filesystem
    const fs = await import('fs')
    const filePath = path.join(__dirname, '..', attachment.url)
    try {
      fs.unlinkSync(filePath)
    } catch (error) {
      console.error('Failed to delete file:', error)
    }

    db.prepare('DELETE FROM file_attachments WHERE id = ?').run(attachmentId)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete attachment error:', error)
    res.status(500).json({ error: 'Failed to delete attachment' })
  }
})

export default router
