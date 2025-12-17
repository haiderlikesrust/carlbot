import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './AnalyticsPage.css'

const API_BASE = 'http://localhost:3000/api'

function AnalyticsPage() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('30')

  useEffect(() => {
    if (user && token) {
      fetchAnalytics()
    } else {
      setLoading(false)
    }
  }, [user, token, timeRange])

  const fetchAnalytics = async () => {
    if (!token) {
      setAnalytics({ error: 'Authentication required' })
      setLoading(false)
      return
    }
    
    try {
      const response = await fetch(`${API_BASE}/analytics/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Analytics fetch failed:', response.status, errorData)
        setAnalytics({ error: errorData.error || `Failed to load: ${response.status}` })
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
      setAnalytics({ error: error.message || 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="analytics-page">
        <div className="analytics-login-prompt">
          <h2>Please login to view your analytics</h2>
          <button onClick={() => navigate('/')}>Go to Login</button>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="analytics-loading">Loading analytics...</div>
  }

  if (!analytics) {
    return <div className="analytics-error">Failed to load analytics</div>
  }

  if (analytics.error) {
    return (
      <div className="analytics-page">
        <div className="analytics-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h1>📊 Analytics Dashboard</h1>
        </div>
        <div className="analytics-error">
          <h2>Error loading analytics</h2>
          <p>{analytics.error}</p>
          <button onClick={fetchAnalytics}>Retry</button>
        </div>
      </div>
    )
  }

  const { stats, postsOverTime, engagementOverTime, topPosts, gameDistribution, followerGrowth } = analytics

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>📊 Analytics Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Posts</h3>
          <div className="stat-value">{stats.total_posts || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Total Comments</h3>
          <div className="stat-value">{stats.total_comments || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Followers</h3>
          <div className="stat-value">{stats.followers || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Following</h3>
          <div className="stat-value">{stats.following || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Likes Received</h3>
          <div className="stat-value">{stats.total_likes_received || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Engagement Rate</h3>
          <div className="stat-value">{stats.engagement_rate || 0}%</div>
        </div>
        <div className="stat-card">
          <h3>Total Engagement</h3>
          <div className="stat-value">{stats.total_engagement || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Comments Received</h3>
          <div className="stat-value">{stats.total_comments_received || 0}</div>
        </div>
      </div>

      {topPosts && topPosts.length > 0 && (
        <div className="section">
          <h2>🔥 Top Performing Posts</h2>
          <div className="top-posts-list">
            {topPosts.map((post) => (
              <div 
                key={post.id} 
                className="top-post-item"
                onClick={() => navigate(`/post/${post.id}`)}
              >
                <div className="post-content">
                  {post.content.substring(0, 100)}...
                </div>
                <div className="post-stats">
                  <span>👍 {post.likes_count || 0}</span>
                  <span>💬 {post.comments_count || 0}</span>
                  <span>📊 {post.engagement_score || 0} engagement</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {gameDistribution && gameDistribution.length > 0 && (
        <div className="section">
          <h2>🎮 Game Distribution</h2>
          <div className="game-distribution">
            {gameDistribution.map((game, index) => (
              <div key={index} className="game-item">
                <span className="game-icon">{game.game_icon || '🎮'}</span>
                <span className="game-name">{game.game_name || 'General'}</span>
                <div className="game-bar">
                  <div 
                    className="game-bar-fill" 
                    style={{ 
                      width: `${(game.post_count / stats.total_posts) * 100}%` 
                    }}
                  />
                </div>
                <span className="game-count">{game.post_count} posts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {postsOverTime && postsOverTime.length > 0 && (
        <div className="section">
          <h2>📈 Posts Over Time (Last 30 Days)</h2>
          <div className="chart-container">
            <div className="chart">
              {postsOverTime.map((item, index) => (
                <div key={index} className="chart-bar-container">
                  <div 
                    className="chart-bar"
                    style={{ 
                      height: `${(item.count / Math.max(...postsOverTime.map(i => i.count))) * 100}%` 
                    }}
                    title={`${item.date}: ${item.count} posts`}
                  />
                  <div className="chart-label">{new Date(item.date).getDate()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {engagementOverTime && engagementOverTime.length > 0 && (
        <div className="section">
          <h2>💚 Engagement Over Time (Last 30 Days)</h2>
          <div className="engagement-chart">
            {engagementOverTime.map((item, index) => {
              const maxEngagement = Math.max(...engagementOverTime.map(i => (i.likes || 0) + (i.comments || 0)))
              const engagement = (item.likes || 0) + (item.comments || 0)
              
              return (
                <div key={index} className="engagement-bar-container">
                  <div className="engagement-stack">
                    <div 
                      className="engagement-bar likes"
                      style={{ 
                        height: `${((item.likes || 0) / maxEngagement) * 100}%` 
                      }}
                      title={`Likes: ${item.likes || 0}`}
                    />
                    <div 
                      className="engagement-bar comments"
                      style={{ 
                        height: `${((item.comments || 0) / maxEngagement) * 100}%` 
                      }}
                      title={`Comments: ${item.comments || 0}`}
                    />
                  </div>
                  <div className="chart-label">{new Date(item.date).getDate()}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {followerGrowth && followerGrowth.length > 0 && (
        <div className="section">
          <h2>👥 Follower Growth (Last 30 Days)</h2>
          <div className="chart-container">
            <div className="chart">
              {followerGrowth.map((item, index) => (
                <div key={index} className="chart-bar-container">
                  <div 
                    className="chart-bar growth"
                    style={{ 
                      height: `${(item.new_followers / Math.max(...followerGrowth.map(i => i.new_followers), 1)) * 100}%` 
                    }}
                    title={`${item.date}: +${item.new_followers} followers`}
                  />
                  <div className="chart-label">{new Date(item.date).getDate()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnalyticsPage
