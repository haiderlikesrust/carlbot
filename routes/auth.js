import express from 'express'
import bcrypt from 'bcryptjs'
import { getDatabase } from '../database/init.js'
import { generateToken } from '../middleware/auth.js'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as DiscordStrategy } from 'passport-discord'
import { Strategy as LocalStrategy } from 'passport-local'

const router = express.Router()

// Configure Passport strategies
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const db = getDatabase()
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      
      if (!user || !user.password_hash) {
        return done(null, false, { message: 'Invalid credentials' })
      }
      
      const isValid = await bcrypt.compare(password, user.password_hash)
      if (!isValid) {
        return done(null, false, { message: 'Invalid credentials' })
      }
      
      // Check if user is banned
      if (user.is_banned === 1) {
        return done(null, false, { message: 'Your account has been banned' })
      }
      
      return done(null, user)
    } catch (error) {
      return done(error)
    }
  }
))

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const db = getDatabase()
      let user = db.prepare('SELECT * FROM users WHERE provider_id = ? AND auth_provider = ?')
        .get(profile.id, 'google')
      
      if (!user) {
        // Check if email already exists (from another auth provider)
        const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(profile.emails[0].value)
        if (existingEmail) {
          return done(null, false, { message: 'Email already registered with another account' })
        }
        
        // Create new user
        const username = profile.emails[0].value.split('@')[0] + '_' + Date.now()
        let result
        try {
          result = db.prepare(`
            INSERT INTO users (email, username, auth_provider, provider_id, avatar_url)
            VALUES (?, ?, 'google', ?, ?)
          `).run(
            profile.emails[0].value,
            username,
            profile.id,
            profile.photos[0]?.value
          )
        } catch (dbError) {
          if (dbError.message && dbError.message.includes('UNIQUE constraint')) {
            if (dbError.message.includes('email')) {
              return done(null, false, { message: 'Email already registered' })
            } else if (dbError.message.includes('username')) {
              // Retry with different username
              const retryUsername = profile.emails[0].value.split('@')[0] + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
              result = db.prepare(`
                INSERT INTO users (email, username, auth_provider, provider_id, avatar_url)
                VALUES (?, ?, 'google', ?, ?)
              `).run(
                profile.emails[0].value,
                retryUsername,
                profile.id,
                profile.photos[0]?.value
              )
            } else {
              throw dbError
            }
          } else {
            throw dbError
          }
        }
        
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
        
        // Create profile
        db.prepare(`
          INSERT INTO user_profiles (user_id, display_name)
          VALUES (?, ?)
        `).run(user.id, profile.displayName || username)
      } else {
        // Update last login
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
      }
      
      // Check if user is banned
      if (user.is_banned === 1) {
        return done(null, false, { message: 'Your account has been banned' })
      }
      
      return done(null, user)
    } catch (error) {
      return done(error)
    }
  }))
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: '/api/auth/discord/callback',
    scope: ['identify', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const db = getDatabase()
      let user = db.prepare('SELECT * FROM users WHERE provider_id = ? AND auth_provider = ?')
        .get(profile.id, 'discord')
      
      if (!user) {
        // Check if email already exists (from another auth provider)
        if (profile.email) {
          const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(profile.email)
          if (existingEmail) {
            return done(null, false, { message: 'Email already registered with another account' })
          }
        }
        
        // Create new user
        const username = profile.username + '_' + Date.now()
        let result
        try {
          result = db.prepare(`
            INSERT INTO users (email, username, auth_provider, provider_id, avatar_url)
            VALUES (?, ?, 'discord', ?, ?)
          `).run(
            profile.email,
            username,
            profile.id,
            `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          )
        } catch (dbError) {
          if (dbError.message && dbError.message.includes('UNIQUE constraint')) {
            if (dbError.message.includes('email') && profile.email) {
              return done(null, false, { message: 'Email already registered' })
            } else if (dbError.message.includes('username')) {
              // Retry with different username
              const retryUsername = profile.username + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
              result = db.prepare(`
                INSERT INTO users (email, username, auth_provider, provider_id, avatar_url)
                VALUES (?, ?, 'discord', ?, ?)
              `).run(
                profile.email,
                retryUsername,
                profile.id,
                `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
              )
            } else {
              throw dbError
            }
          } else {
            throw dbError
          }
        }
        
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
        
        db.prepare(`
          INSERT INTO user_profiles (user_id, display_name)
          VALUES (?, ?)
        `).run(user.id, profile.username || username)
      } else {
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
      }
      
      // Check if user is banned
      if (user.is_banned === 1) {
        return done(null, false, { message: 'Your account has been banned' })
      }
      
      return done(null, user)
    } catch (error) {
      return done(error)
    }
  }))
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser((id, done) => {
  try {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    done(null, user)
  } catch (error) {
    done(error)
  }
})

// Email signup
router.post('/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body
    
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' })
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    
    const db = getDatabase()
    
    // Check if email or username exists
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' })
    }
    
    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' })
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)
    
    // Create user with error handling for UNIQUE constraint
    let result
    try {
      result = db.prepare(`
        INSERT INTO users (email, username, password_hash, auth_provider)
        VALUES (?, ?, ?, 'email')
      `).run(email, username, passwordHash)
    } catch (dbError) {
      // Handle UNIQUE constraint violation (race condition or direct DB access)
      if (dbError.message && dbError.message.includes('UNIQUE constraint')) {
        if (dbError.message.includes('email')) {
          return res.status(400).json({ error: 'Email already registered' })
        } else if (dbError.message.includes('username')) {
          return res.status(400).json({ error: 'Username already taken' })
        }
      }
      throw dbError // Re-throw if it's a different error
    }
    
    const userId = result.lastInsertRowid
    
    // Create profile
    db.prepare(`
      INSERT INTO user_profiles (user_id, display_name)
      VALUES (?, ?)
    `).run(userId, username)
    
    const user = db.prepare('SELECT id, email, username, created_at FROM users WHERE id = ?').get(userId)
    const token = generateToken(user)
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token
    })
  } catch (error) {
    console.error('Signup error:', error)
    res.status(500).json({ error: 'Failed to create account' })
  }
})

// Email login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return res.status(500).json({ error: 'Authentication error' })
    }
    if (!user) {
      return res.status(401).json({ error: info.message || 'Invalid credentials' })
    }
    
    // Double-check ban status (in case it changed after authentication)
    const db = getDatabase()
    const currentUser = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(user.id)
    if (currentUser && currentUser.is_banned === 1) {
      return res.status(403).json({ error: 'Your account has been banned' })
    }
    
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
    
    const token = generateToken(user)
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token
    })
  })(req, res, next)
})

// Google OAuth (only if credentials are configured)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

  router.get('/google/callback',
    passport.authenticate('google', { session: false }),
    (req, res) => {
      // Check if user is banned
      const db = getDatabase()
      const user = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(req.user.id)
      if (user && user.is_banned === 1) {
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?error=banned`)
      }
      
      const token = generateToken(req.user)
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${token}`)
    }
  )
} else {
  // Return error if Google OAuth is not configured
  router.get('/google', (req, res) => {
    res.status(503).json({ error: 'Google OAuth is not configured' })
  })
  
  router.get('/google/callback', (req, res) => {
    res.status(503).json({ error: 'Google OAuth is not configured' })
  })
}

// Discord OAuth (only if credentials are configured)
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  router.get('/discord', passport.authenticate('discord'))

  router.get('/discord/callback',
    passport.authenticate('discord', { session: false }),
    (req, res) => {
      // Check if user is banned
      const db = getDatabase()
      const user = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(req.user.id)
      if (user && user.is_banned === 1) {
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?error=banned`)
      }
      
      const token = generateToken(req.user)
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${token}`)
    }
  )
} else {
  // Return error if Discord OAuth is not configured
  router.get('/discord', (req, res) => {
    res.status(503).json({ error: 'Discord OAuth is not configured' })
  })
  
  router.get('/discord/callback', (req, res) => {
    res.status(503).json({ error: 'Discord OAuth is not configured' })
  })
}

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    
    const jwt = await import('jsonwebtoken')
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    const decoded = jwt.default.verify(token, JWT_SECRET)
    
    const db = getDatabase()
    const user = db.prepare(`
      SELECT u.*, p.* 
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `).get(decoded.id)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Check if user is banned
    if (user.is_banned === 1) {
      return res.status(403).json({ error: 'Your account has been banned' })
    }
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      avatar_url: user.avatar_url,
      profile: {
        display_name: user.display_name,
        bio: user.bio,
        favorite_games: user.favorite_games ? JSON.parse(user.favorite_games) : [],
        custom_games: user.custom_games ? JSON.parse(user.custom_games) : [],
        theme_preference: user.theme_preference,
        profile_color: user.profile_color
      }
    })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router

