import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' })
    }
    
    // Check if user is banned
    try {
      const { getDatabase } = await import('../database/init.js')
      const db = getDatabase()
      const user = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(decoded.id)
      
      if (user && user.is_banned === 1) {
        return res.status(403).json({ error: 'Your account has been banned' })
      }
    } catch (dbError) {
      console.error('Ban check error:', dbError)
      // Continue if we can't check - don't block legitimate users
    }
    
    req.user = decoded
    next()
  })
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user
      }
    })
  }
  next()
}

export function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      username: user.username 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

