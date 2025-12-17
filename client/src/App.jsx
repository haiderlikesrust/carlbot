import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Chat from './components/Chat'
import GameModeSwitcher from './components/GameModeSwitcher'
import AuthModal from './components/AuthModal'
import ProfileModal from './components/ProfileModal'
import Notifications from './components/Notifications'
import GlobalSearch from './components/GlobalSearch'
import AnimatedBackground from './components/AnimatedBackground'
import { loadConversationHistory } from './utils/storage'
import './App.css'

const API_BASE = 'http://localhost:3000/api'

function AppContent() {
  const navigate = useNavigate()
  const { user, loading, logout } = useAuth()
  const [conversationHistory, setConversationHistory] = useState(() => loadConversationHistory())
  const [autoPlayVoice, setAutoPlayVoice] = useState(true)
  const [currentGame, setCurrentGame] = useState('general')
  const [theme, setTheme] = useState('dark')
  const [showAuth, setShowAuth] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K or Cmd+K - Quick actions menu (placeholder)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        // Could open a command palette here
      }
      // Ctrl+F or Cmd+F - Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        // Search will be handled by SearchBar component
      }
      // Escape - Close modals
      if (e.key === 'Escape') {
        // Close any open modals
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Theme management
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-text">Loading Carl...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`app theme-${theme}`}>
      <AnimatedBackground />
      <div className="container">
        <header>
          <div className="header-content">
            <div className="header-left">
              <h1 className="retro-title">🎮 CARL</h1>
              <p className="subtitle">GAMING COMPANION</p>
            </div>
            <div className="header-right">
              <div className="header-btn-group">
                <GlobalSearch />
                <GameModeSwitcher 
                  currentGame={currentGame} 
                  onGameChange={setCurrentGame} 
                />
              </div>
              
              <div className="header-btn-group">
                <button 
                  className="header-btn"
                  onClick={() => navigate('/social')}
                  title="Social Feed"
                >
                  📱
                </button>
                <button 
                  className="header-btn"
                  onClick={() => navigate('/communities')}
                  title="Communities"
                >
                  👥
                </button>
                <button 
                  className="header-btn"
                  onClick={() => navigate('/discord')}
                  title="Carlcord"
                >
                  💬
                </button>
                <button 
                  className="header-btn"
                  onClick={() => navigate('/carlbot')}
                  title="Carlbot Profile"
                >
                  🤖
                </button>
              </div>
              
              <div className="header-btn-group">
                <button 
                  className="header-btn"
                  onClick={() => navigate('/admin')}
                  title="Admin Panel"
                >
                  ⚙️
                </button>
                <button 
                  className="header-btn"
                  onClick={() => navigate('/achievements')}
                  title="Achievements"
                >
                  🏆
                </button>
                <button 
                  className="header-btn"
                  onClick={() => navigate('/leaderboard')}
                  title="Leaderboard"
                >
                  📊
                </button>
                {user && (
                  <button 
                    className="header-btn"
                    onClick={() => navigate('/analytics')}
                    title="My Analytics"
                  >
                    📈
                  </button>
                )}
              </div>
              
              {user ? (
                <div className="header-btn-group">
                  <Notifications />
                  <button 
                    className="header-btn"
                    onClick={() => navigate('/messages')}
                    title="Messages"
                  >
                    ✉️
                  </button>
                  <button 
                    className="header-btn"
                    onClick={() => navigate('/settings/profile')}
                    title="Customize Profile"
                  >
                    👤 {user.username}
                  </button>
                  <button 
                    className="header-btn logout-btn"
                    onClick={logout}
                    title="Logout"
                  >
                    🚪
                  </button>
                </div>
              ) : (
                <div className="header-btn-group">
                  <button 
                    className="header-btn login-btn"
                    onClick={() => setShowAuth(true)}
                    title="Login / Sign Up"
                  >
                    🔐 Login
                  </button>
                </div>
              )}
              
              <button 
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </header>
        <Chat 
          apiBase={API_BASE}
          conversationHistory={conversationHistory}
          setConversationHistory={setConversationHistory}
          autoPlayVoice={autoPlayVoice}
          setAutoPlayVoice={setAutoPlayVoice}
          currentGame={currentGame}
          user={user}
        />
      </div>
      
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
      {user && <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} />}
    </div>
  )
}

function App() {
  return <AppContent />
}

export default App
