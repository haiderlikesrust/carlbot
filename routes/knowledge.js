import express from 'express'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { detectGame, getGameContext } from '../utils/gameDetector.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Get game knowledge
router.get('/games/:gameKey', optionalAuth, (req, res) => {
  try {
    const { gameKey } = req.params
    const knowledgePath = path.join(__dirname, '..', 'data', 'games-knowledge.json')
    const data = fs.readFileSync(knowledgePath, 'utf8')
    const knowledge = JSON.parse(data)
    
    const game = knowledge.games[gameKey.toLowerCase()]
    if (!game) {
      return res.status(404).json({ error: 'Game not found' })
    }
    
    res.json(game)
  } catch (error) {
    console.error('Get game knowledge error:', error)
    res.status(500).json({ error: 'Failed to get game knowledge' })
  }
})

// Get all games
router.get('/games', optionalAuth, (req, res) => {
  try {
    const knowledgePath = path.join(__dirname, '..', 'data', 'games-knowledge.json')
    const data = fs.readFileSync(knowledgePath, 'utf8')
    const knowledge = JSON.parse(data)
    
    const gamesList = Object.entries(knowledge.games).map(([key, game]) => ({
      key,
      name: game.name,
      type: game.type,
      aliases: game.aliases
    }))
    
    res.json(gamesList)
  } catch (error) {
    console.error('Get games list error:', error)
    res.status(500).json({ error: 'Failed to get games list' })
  }
})

// Detect game from text
router.post('/detect', optionalAuth, (req, res) => {
  try {
    const { text } = req.body
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' })
    }
    
    const detectedGame = detectGame(text)
    
    if (detectedGame) {
      res.json({
        detected: true,
        game: {
          key: detectedGame.key,
          name: detectedGame.name,
          type: detectedGame.type
        },
        context: getGameContext(detectedGame)
      })
    } else {
      res.json({ detected: false })
    }
  } catch (error) {
    console.error('Detect game error:', error)
    res.status(500).json({ error: 'Failed to detect game' })
  }
})

// Update game knowledge (admin only - for future use)
router.put('/games/:gameKey', authenticateToken, (req, res) => {
  try {
    const { gameKey } = req.params
    const updates = req.body
    
    const knowledgePath = path.join(__dirname, '..', 'data', 'games-knowledge.json')
    const data = fs.readFileSync(knowledgePath, 'utf8')
    const knowledge = JSON.parse(data)
    
    if (!knowledge.games[gameKey.toLowerCase()]) {
      return res.status(404).json({ error: 'Game not found' })
    }
    
    // Merge updates
    knowledge.games[gameKey.toLowerCase()] = {
      ...knowledge.games[gameKey.toLowerCase()],
      ...updates
    }
    
    fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2))
    
    res.json({ message: 'Game knowledge updated', game: knowledge.games[gameKey.toLowerCase()] })
  } catch (error) {
    console.error('Update game knowledge error:', error)
    res.status(500).json({ error: 'Failed to update game knowledge' })
  }
})

export default router

