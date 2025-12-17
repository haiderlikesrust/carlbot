import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './CarlbotProfilePage.css'

const API_BASE = 'http://localhost:3000/api'

function CarlbotProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    likesGiven: 0,
    commentsGiven: 0,
    retweetsGiven: 0
  })

  useEffect(() => {
    fetchProfile()
    fetchBotActivity()
  }, [])

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_BASE}/bot/profile`)
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
      }
    } catch (error) {
      console.error('Failed to fetch Carlbot profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchBotActivity = async () => {
    try {
      // Get posts Carlbot has interacted with
      const db = await fetch(`${API_BASE}/bot/activity`)
      // For now, we'll calculate stats from the profile
      // In a full implementation, you'd have an activity endpoint
    } catch (error) {
      console.error('Failed to fetch bot activity:', error)
    }
  }

  const triggerAutoInteract = async () => {
    try {
      const response = await fetch(`${API_BASE}/bot/auto-interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 })
      })
      
      if (response.ok) {
        const data = await response.json()
        alert(`Carlbot interacted with ${data.count} posts!`)
        fetchProfile()
      }
    } catch (error) {
      console.error('Failed to trigger auto-interact:', error)
    }
  }

  if (loading) {
    return <div className="loading">Loading Carlbot profile...</div>
  }

  if (!profile) {
    return <div className="error">Failed to load Carlbot profile</div>
  }

  return (
    <div className="carlbot-profile-page">
      <header className="profile-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Back
        </button>
        <h1>🤖 Carlbot Profile</h1>
      </header>

      <div className="profile-content">
        <div className="profile-card">
          <div className="profile-avatar">🤖</div>
          <h2>{profile.display_name || profile.username}</h2>
          <p className="profile-bio">{profile.bio}</p>
          
          <div className="profile-stats">
            <div className="stat">
              <span className="stat-value">{profile.followers_count || 0}</span>
              <span className="stat-label">Followers</span>
            </div>
            <div className="stat">
              <span className="stat-value">{profile.following_count || 0}</span>
              <span className="stat-label">Following</span>
            </div>
            <div className="stat">
              <span className="stat-value">{profile.posts_count || 0}</span>
              <span className="stat-label">Posts</span>
            </div>
          </div>
        </div>

        <div className="bot-controls">
          <h3>Bot Controls</h3>
          <div className="control-info">
            <p>Carlbot automatically interacts with trending posts every 30 minutes.</p>
            <p>It likes, comments, and retweets posts based on AI analysis.</p>
          </div>
          
          {user && (
            <button 
              className="trigger-btn"
              onClick={triggerAutoInteract}
            >
              🤖 Trigger Auto-Interact Now
            </button>
          )}
        </div>

        <div className="bot-features">
          <h3>Bot Features</h3>
          <ul>
            <li>✅ Auto-likes gaming strategy posts</li>
            <li>✅ Auto-comments with tactical advice</li>
            <li>✅ Auto-retweets valuable content</li>
            <li>✅ Analyzes trending posts</li>
            <li>✅ AI-powered decision making</li>
            <li>✅ Respects community privacy</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default CarlbotProfilePage

