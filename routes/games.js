import express from 'express'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { getDatabase } from '../database/init.js'

const router = express.Router()

// Get all games (default + user's custom games)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    let games
    
    if (req.user) {
      // Get default games + user's custom games
      games = db.prepare(`
        SELECT * FROM games 
        WHERE is_default = 1 OR created_by = ?
        ORDER BY is_default DESC, name ASC
      `).all(req.user.id)
    } else {
      // Only default games for non-authenticated users
      games = db.prepare('SELECT * FROM games WHERE is_default = 1 ORDER BY name ASC').all()
    }
    
    res.json(games)
  } catch (error) {
    console.error('Get games error:', error)
    res.status(500).json({ error: 'Failed to get games' })
  }
})

// Add custom game
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, icon, description } = req.body
    
    if (!name) {
      return res.status(400).json({ error: 'Game name is required' })
    }
    
    const db = getDatabase()
    
    // Check if game already exists
    const existing = db.prepare('SELECT id FROM games WHERE name = ?').get(name)
    if (existing) {
      return res.status(400).json({ error: 'Game already exists' })
    }
    
    const result = db.prepare(`
      INSERT INTO games (name, icon, description, created_by, is_default)
      VALUES (?, ?, ?, ?, 0)
    `).run(name, icon || '🎮', description || '', req.user.id, 0)
    
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(result.lastInsertRowid)
    res.json(game)
  } catch (error) {
    console.error('Add game error:', error)
    res.status(500).json({ error: 'Failed to add game' })
  }
})

// Delete custom game
router.delete('/:gameId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.gameId)
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' })
    }
    
    if (game.is_default) {
      return res.status(403).json({ error: 'Cannot delete default games' })
    }
    
    if (game.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this game' })
    }
    
    db.prepare('DELETE FROM games WHERE id = ?').run(req.params.gameId)
    res.json({ message: 'Game deleted successfully' })
  } catch (error) {
    console.error('Delete game error:', error)
    res.status(500).json({ error: 'Failed to delete game' })
  }
})

export default router

