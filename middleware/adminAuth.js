import jwt from 'jsonwebtoken'
import { getDatabase } from '../database/init.js'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || JWT_SECRET + '-admin'

// Generate admin token
export function generateAdminToken(admin) {
  return jwt.sign(
    { 
      id: admin.id, 
      username: admin.username,
      email: admin.email,
      role: 'admin'
    },
    ADMIN_JWT_SECRET,
    { expiresIn: '24h' } // Shorter expiry for admin tokens
  )
}

// Verify admin token
export function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  jwt.verify(token, ADMIN_JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired admin token' })
    }

    // Verify admin still exists and is active
    try {
      const db = getDatabase()
      const admin = db.prepare('SELECT * FROM admin_users WHERE id = ? AND is_active = 1').get(decoded.id)
      
      if (!admin) {
        return res.status(403).json({ error: 'Admin account not found or inactive' })
      }

      req.admin = {
        id: admin.id,
        username: admin.username,
        email: admin.email
      }
      next()
    } catch (error) {
      console.error('Admin verification error:', error)
      return res.status(500).json({ error: 'Failed to verify admin' })
    }
  })
}

// Optional admin auth (for routes that work with or without admin)
export function optionalAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token) {
    jwt.verify(token, ADMIN_JWT_SECRET, async (err, decoded) => {
      if (!err) {
        try {
          const db = getDatabase()
          const admin = db.prepare('SELECT * FROM admin_users WHERE id = ? AND is_active = 1').get(decoded.id)
          if (admin) {
            req.admin = {
              id: admin.id,
              username: admin.username,
              email: admin.email
            }
          }
        } catch (error) {
          // Silently fail for optional auth
        }
      }
    })
  }
  next()
}
