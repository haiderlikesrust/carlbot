import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './GameModeSwitcher.css'

function GameModeSwitcher({ currentGame, onGameChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [games, setGames] = useState([
    { id: 'general', name: 'General', icon: '🎮' }
  ])
  const { token } = useAuth()

  useEffect(() => {
    fetchGames()
  }, [token])

  const fetchGames = async () => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch('http://localhost:3000/api/games', { headers })
      const data = await response.json()
      
      // Map database games to format expected by component
      const mappedGames = data.map(game => ({
        id: game.id.toString(),
        name: game.name,
        icon: game.icon || '🎮'
      }))
      
      // Add general as first option
      setGames([
        { id: 'general', name: 'General', icon: '🎮' },
        ...mappedGames
      ])
    } catch (error) {
      console.error('Failed to fetch games:', error)
    }
  }

  const handleGameSelect = (game) => {
    onGameChange(game.id)
    setIsOpen(false)
  }

  return (
    <div className="game-mode-switcher">
      <button 
        className="game-mode-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch game mode"
      >
        <span className="game-icon">
          {games.find(g => g.id === currentGame || g.id.toString() === currentGame)?.icon || '🎮'}
        </span>
        <span className="game-name">
          {games.find(g => g.id === currentGame || g.id.toString() === currentGame)?.name || 'General'}
        </span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="game-dropdown">
          {games.map(game => (
            <button
              key={game.id}
              className={`game-option ${(currentGame === game.id || currentGame === game.id.toString()) ? 'active' : ''}`}
              onClick={() => handleGameSelect(game)}
            >
              <span className="game-option-icon">{game.icon}</span>
              <span className="game-option-name">{game.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default GameModeSwitcher

