import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './AchievementsPage.css'

const API_BASE = 'http://localhost:3000/api'

function AchievementsPage() {
  const navigate = useNavigate()
  const { userId } = useParams()
  const { user, token } = useAuth()
  const [achievements, setAchievements] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showNotification, setShowNotification] = useState(null)

  useEffect(() => {
    fetchAchievements()
  }, [userId, user, token])

  const fetchAchievements = async () => {
    try {
      const targetUserId = userId || user?.id
      if (!targetUserId) {
        setLoading(false)
        return
      }

      const url = userId 
        ? `${API_BASE}/achievements/user/${targetUserId}`
        : `${API_BASE}/achievements/me`
      
      const response = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      
      if (response.ok) {
        const data = await response.json()
        setAchievements(data.achievements || [])
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch achievements:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'common': return '#888'
      case 'rare': return '#00ff41'
      case 'epic': return '#9d4edd'
      case 'legendary': return '#ffd700'
      default: return '#888'
    }
  }

  const filteredAchievements = filter === 'all' 
    ? achievements 
    : achievements.filter(a => a.category === filter)

  const categories = ['all', 'content', 'social', 'engagement', 'progression']
  const categoryNames = {
    all: 'All',
    content: 'Content',
    social: 'Social',
    engagement: 'Engagement',
    progression: 'Progression'
  }

  if (loading) {
    return <div className="achievements-loading">Loading achievements...</div>
  }

  return (
    <div className="achievements-page">
      <div className="achievements-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>🏆 Achievements</h1>
      </div>

      {stats && (
        <div className="user-stats-card">
          <div className="stat-item">
            <div className="stat-label">Level</div>
            <div className="stat-value level">{stats.level || 1}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">XP</div>
            <div className="stat-value xp">
              {stats.xp || 0} / 100
              <div className="xp-bar">
                <div 
                  className="xp-bar-fill" 
                  style={{ width: `${((stats.xp || 0) / 100) * 100}%` }}
                />
              </div>
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Total Points</div>
            <div className="stat-value points">{stats.total_points || 0}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Streak</div>
            <div className="stat-value streak">
              {stats.streak_days || 0} days 🔥
            </div>
          </div>
        </div>
      )}

      <div className="achievements-filters">
        {categories.map(cat => (
          <button
            key={cat}
            className={filter === cat ? 'active' : ''}
            onClick={() => setFilter(cat)}
          >
            {categoryNames[cat]}
          </button>
        ))}
      </div>

      <div className="achievements-grid">
        {filteredAchievements.map((achievement) => {
          const isEarned = achievement.earned === 1
          const progress = achievement.progress || 0
          
          return (
            <div
              key={achievement.id}
              className={`achievement-card ${isEarned ? 'earned' : 'locked'}`}
              style={{ borderColor: getRarityColor(achievement.rarity) }}
            >
              <div className="achievement-icon" style={{ color: getRarityColor(achievement.rarity) }}>
                {achievement.icon || '🏆'}
              </div>
              <div className="achievement-info">
                <h3>{achievement.name}</h3>
                <p>{achievement.description}</p>
                {!isEarned && (
                  <div className="achievement-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="progress-text">{Math.round(progress)}%</span>
                  </div>
                )}
                {isEarned && achievement.earned_at && (
                  <div className="earned-date">
                    Earned {new Date(achievement.earned_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="achievement-points" style={{ color: getRarityColor(achievement.rarity) }}>
                +{achievement.points} pts
              </div>
            </div>
          )
        })}
      </div>

      {filteredAchievements.length === 0 && (
        <div className="no-achievements">
          No achievements found in this category.
        </div>
      )}
    </div>
  )
}

export default AchievementsPage
