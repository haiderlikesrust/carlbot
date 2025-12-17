import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './LeaderboardPage.css'

const API_BASE = 'http://localhost:3000/api'

function LeaderboardPage() {
  const navigate = useNavigate()
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('points')

  useEffect(() => {
    fetchLeaderboard()
  }, [sortBy])

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${API_BASE}/achievements/leaderboard?type=${sortBy}&limit=100`)
      if (response.ok) {
        const data = await response.json()
        setLeaderboard(data)
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRankIcon = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  if (loading) {
    return <div className="leaderboard-loading">Loading leaderboard...</div>
  }

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>🏆 Leaderboard</h1>
      </div>

      <div className="leaderboard-filters">
        <button 
          className={sortBy === 'points' ? 'active' : ''}
          onClick={() => setSortBy('points')}
        >
          Points
        </button>
        <button 
          className={sortBy === 'posts' ? 'active' : ''}
          onClick={() => setSortBy('posts')}
        >
          Posts
        </button>
        <button 
          className={sortBy === 'followers' ? 'active' : ''}
          onClick={() => setSortBy('followers')}
        >
          Followers
        </button>
        <button 
          className={sortBy === 'level' ? 'active' : ''}
          onClick={() => setSortBy('level')}
        >
          Level
        </button>
      </div>

      <div className="leaderboard-list">
        {leaderboard.map((user, index) => {
          const rank = index + 1
          const displayValue = sortBy === 'points' ? user.total_points
            : sortBy === 'posts' ? user.posts_count
            : sortBy === 'followers' ? user.followers_count
            : user.level

          return (
            <div 
              key={user.user_id} 
              className={`leaderboard-item ${rank <= 3 ? 'top-three' : ''}`}
              onClick={() => navigate(`/user/${user.username}`)}
            >
              <div className="rank">{getRankIcon(rank)}</div>
              <div className="user-info">
                <div className="avatar">
                  {user.avatar_url || '👤'}
                </div>
                <div className="user-details">
                  <div className="username">{user.display_name || user.username}</div>
                  <div className="user-stats">
                    <span>Level {user.level || 1}</span>
                    <span>•</span>
                    <span>{user.achievements_count || 0} achievements</span>
                  </div>
                </div>
              </div>
              <div className="score">
                <div className="score-label">
                  {sortBy === 'points' ? 'Points' :
                   sortBy === 'posts' ? 'Posts' :
                   sortBy === 'followers' ? 'Followers' :
                   'Level'}
                </div>
                <div className="score-value">{displayValue || 0}</div>
              </div>
            </div>
          )
        })}
      </div>

      {leaderboard.length === 0 && (
        <div className="no-leaderboard">
          No users found on the leaderboard yet.
        </div>
      )}
    </div>
  )
}

export default LeaderboardPage
