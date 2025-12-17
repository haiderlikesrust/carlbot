import express from 'express'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { getDatabase } from '../database/init.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Configure multer for profile image uploads
const upload = multer({
  dest: 'uploads/profiles/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  }
})

// Get user profile by username
router.get('/user/:username', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user?.id || null
    
    const user = db.prepare(`
      SELECT 
        u.id as user_id,
        u.username,
        u.avatar_url,
        u.created_at,
        up.display_name,
        up.bio,
        up.profile_banner,
        up.profile_color,
        (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count,
        (SELECT COUNT(*) FROM social_posts WHERE user_id = u.id) as posts_count,
        ${userId ? `(SELECT COUNT(*) FROM user_follows WHERE follower_id = ? AND following_id = u.id) as is_following` : '0 as is_following'}
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.username = ?
    `).get(userId, req.params.username)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    res.json(user)
  } catch (error) {
    console.error('Get profile error:', error)
    res.status(500).json({ error: 'Failed to get profile' })
  }
})

// Get user profile by ID
router.get('/:userId', async (req, res) => {
  try {
    const db = getDatabase()
    const user = db.prepare(`
      SELECT u.*, p.* 
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `).get(req.params.userId)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    res.json({
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      profile: {
        display_name: user.display_name,
        bio: user.bio,
        favorite_games: user.favorite_games ? JSON.parse(user.favorite_games) : [],
        custom_games: user.custom_games ? JSON.parse(user.custom_games) : [],
        theme_preference: user.theme_preference,
        profile_color: user.profile_color,
        social_links: user.social_links ? JSON.parse(user.social_links) : {}
      }
    })
  } catch (error) {
    console.error('Get profile error:', error)
    res.status(500).json({ error: 'Failed to get profile' })
  }
})

// Get own profile (for settings)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const user = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.avatar_url,
        u.created_at,
        up.*
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = ?
    `).get(req.user.id)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      profile: {
        display_name: user.display_name,
        bio: user.bio,
        profile_banner: user.profile_banner,
        profile_color: user.profile_color,
        favorite_games: user.favorite_games ? JSON.parse(user.favorite_games) : [],
        custom_games: user.custom_games ? JSON.parse(user.custom_games) : [],
        theme_preference: user.theme_preference,
        social_links: user.social_links ? JSON.parse(user.social_links) : {},
        settings: user.settings
      }
    })
  } catch (error) {
    console.error('Get profile error:', error)
    res.status(500).json({ error: 'Failed to get profile' })
  }
})

// Upload profile image (banner or avatar)
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' })
    }

    const { type } = req.body // 'banner' or 'avatar'
    const fileExt = path.extname(req.file.originalname)
    const fileName = `${type}_${req.user.id}_${Date.now()}${fileExt}`
    const filePath = path.join(__dirname, '..', 'uploads', 'profiles', fileName)
    
    // Create profiles directory if it doesn't exist
    const profilesDir = path.join(__dirname, '..', 'uploads', 'profiles')
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true })
    }

    // Move file to final location
    fs.renameSync(req.file.path, filePath)
    
    const url = `/uploads/profiles/${fileName}`
    
    // Update database
    const db = getDatabase()
    if (type === 'avatar') {
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id)
    } else if (type === 'banner') {
      db.prepare('UPDATE user_profiles SET profile_banner = ? WHERE user_id = ?').run(url, req.user.id)
    }
    
    res.json({ url, message: 'Image uploaded successfully' })
  } catch (error) {
    console.error('Upload error:', error)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// Update own profile
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { 
      display_name, 
      bio, 
      favorite_games, 
      custom_games, 
      theme_preference, 
      profile_color, 
      profile_banner,
      avatar_url,
      social_links,
      settings
    } = req.body
    const db = getDatabase()
    
    // Update user_profiles
    db.prepare(`
      UPDATE user_profiles 
      SET 
        display_name = COALESCE(?, display_name),
        bio = COALESCE(?, bio),
        favorite_games = COALESCE(?, favorite_games),
        custom_games = COALESCE(?, custom_games),
        theme_preference = COALESCE(?, theme_preference),
        profile_color = COALESCE(?, profile_color),
        profile_banner = COALESCE(?, profile_banner),
        social_links = COALESCE(?, social_links),
        settings = COALESCE(?, settings),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      display_name,
      bio,
      favorite_games ? JSON.stringify(favorite_games) : null,
      custom_games ? JSON.stringify(custom_games) : null,
      theme_preference,
      profile_color,
      profile_banner,
      social_links ? JSON.stringify(social_links) : null,
      settings,
      req.user.id
    )
    
    // Update avatar_url in users table if provided
    // Note: avatar_url is already updated by the upload endpoint, but we allow it here for direct updates
    if (avatar_url !== undefined && avatar_url !== null) {
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, req.user.id)
      console.log('Updated avatar_url in users table:', avatar_url)
    }
    
    res.json({ message: 'Profile updated successfully' })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

export default router

