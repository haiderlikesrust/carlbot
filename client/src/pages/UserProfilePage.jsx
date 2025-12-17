import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import Alert from '../components/Alert'
import LoadingScreen from '../components/LoadingScreen'
import './UserProfilePage.css'

const API_BASE = 'http://localhost:3000/api'

function UserProfilePage() {
  const { username: urlUsername } = useParams()
  const navigate = useNavigate()
  const { user: currentUser, token } = useAuth()
  const { alert, showAlert, hideAlert, showLoginAlert } = useAlert()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('posts')
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFollowing, setShowFollowing] = useState(false)
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [blockStatus, setBlockStatus] = useState({ isBlocked: false, isMuted: false })

  useEffect(() => {
    if (urlUsername) {
      fetchProfile()
      fetchPosts()
    }
  }, [urlUsername])

  useEffect(() => {
    if (currentUser && profile && currentUser.id !== profile.user_id && currentUser.id !== profile.id) {
      fetchBlockStatus()
    }
  }, [currentUser, profile, token])

  const fetchBlockStatus = async () => {
    if (!currentUser || !profile || currentUser.id === profile.user_id) return
    try {
      const response = await fetch(`${API_BASE}/blocks/${profile.user_id}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setBlockStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch block status:', error)
    }
  }

  const fetchProfile = async () => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch(`${API_BASE}/profiles/user/${urlUsername}`, { headers })
      if (response.ok) {
        const data = await response.json()
        console.log('Profile data:', data)
        setProfile(data)
      } else {
        showAlert('User not found', 'error')
        navigate('/social')
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
      showAlert('Failed to load profile', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchPosts = async () => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch(`${API_BASE}/social/user/${urlUsername}/posts`, { headers })
      if (response.ok) {
        const data = await response.json()
        setPosts(data)
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    }
  }

  const handleFollow = async () => {
    if (!currentUser) {
      showLoginAlert('following users')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/follows/${profile.user_id}/follow`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        fetchProfile()
        showAlert('Followed user!', 'success')
      }
    } catch (error) {
      console.error('Failed to follow user:', error)
      showAlert('Failed to follow user', 'error')
    }
  }

  const handleUnfollow = async () => {
    try {
      const response = await fetch(`${API_BASE}/follows/${profile.user_id}/unfollow`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        fetchProfile()
        showAlert('Unfollowed user', 'success')
      }
    } catch (error) {
      console.error('Failed to unfollow user:', error)
      showAlert('Failed to unfollow user', 'error')
    }
  }

  const handleBlock = async () => {
    if (!confirm('Are you sure you want to block this user? You won\'t see their content.')) return
    try {
      const response = await fetch(`${API_BASE}/blocks/${profile.user_id}/block`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        setBlockStatus({ ...blockStatus, isBlocked: true })
        showAlert('User blocked', 'success')
        fetchProfile()
      }
    } catch (error) {
      console.error('Failed to block user:', error)
      showAlert('Failed to block user', 'error')
    }
  }

  const handleUnblock = async () => {
    try {
      const response = await fetch(`${API_BASE}/blocks/${profile.user_id}/block`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        setBlockStatus({ ...blockStatus, isBlocked: false })
        showAlert('User unblocked', 'success')
      }
    } catch (error) {
      console.error('Failed to unblock user:', error)
      showAlert('Failed to unblock user', 'error')
    }
  }

  const handleMute = async () => {
    try {
      const response = await fetch(`${API_BASE}/blocks/${profile.user_id}/mute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        setBlockStatus({ ...blockStatus, isMuted: true })
        showAlert('User muted', 'success')
      }
    } catch (error) {
      console.error('Failed to mute user:', error)
      showAlert('Failed to mute user', 'error')
    }
  }

  const handleUnmute = async () => {
    try {
      const response = await fetch(`${API_BASE}/blocks/${profile.user_id}/mute`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        setBlockStatus({ ...blockStatus, isMuted: false })
        showAlert('User unmuted', 'success')
      }
    } catch (error) {
      console.error('Failed to unmute user:', error)
      showAlert('Failed to unmute user', 'error')
    }
  }

  const fetchFollowers = async () => {
    try {
      const userId = profile.user_id || profile.id
      if (!userId) {
        console.error('No user ID found in profile:', profile)
        showAlert('Failed to load followers: Invalid profile data', 'error')
        return
      }
      
      const response = await fetch(`${API_BASE}/follows/${userId}/followers`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Followers data:', data)
        setFollowers(data || [])
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to fetch followers:', response.status, errorData)
        showAlert('Failed to load followers', 'error')
      }
    } catch (error) {
      console.error('Failed to fetch followers:', error)
      showAlert('Failed to load followers', 'error')
    }
  }

  const fetchFollowing = async () => {
    try {
      const userId = profile.user_id || profile.id
      if (!userId) {
        console.error('No user ID found in profile:', profile)
        showAlert('Failed to load following: Invalid profile data', 'error')
        return
      }
      
      const response = await fetch(`${API_BASE}/follows/${userId}/following`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Following data:', data)
        setFollowing(data || [])
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to fetch following:', response.status, errorData)
        showAlert('Failed to load following', 'error')
      }
    } catch (error) {
      console.error('Failed to fetch following:', error)
      showAlert('Failed to load following', 'error')
    }
  }

  const handleShowFollowers = () => {
    setShowFollowers(true)
    fetchFollowers()
  }

  const handleShowFollowing = () => {
    setShowFollowing(true)
    fetchFollowing()
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  // Check if viewing own profile - use multiple methods for reliability
  const isOwnProfile = currentUser && profile && (
    currentUser.id === profile.user_id || 
    currentUser.id === profile.id ||
    (currentUser.username && profile.username && currentUser.username.toLowerCase() === profile.username.toLowerCase()) ||
    (currentUser.username && urlUsername && currentUser.username.toLowerCase() === urlUsername.toLowerCase())
  )

  if (loading) {
    return <LoadingScreen message="Loading profile..." />
  }

  if (!profile) {
    return null
  }

  return (
    <div className="user-profile-page">
      <header className="profile-header">
        <button className="back-btn" onClick={() => navigate('/social')}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {isOwnProfile && (
            <button 
              className="edit-profile-btn" 
              onClick={() => navigate('/settings/profile')}
              title="Customize your profile"
            >
              ⚙️ Customize Profile
            </button>
          )}
        </div>
      </header>

      <div className="profile-container">
        <div className="profile-banner">
          {profile.profile_banner && (
            <img src={profile.profile_banner} alt="Banner" className="banner-image" />
          )}
        </div>

        <div className="profile-info">
          <div className="profile-avatar-section">
            {profile.avatar_url ? (
              <img 
                src={profile.avatar_url.startsWith('http') ? profile.avatar_url : `http://localhost:3000${profile.avatar_url}`} 
                alt={profile.username} 
                className="profile-avatar"
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling.style.display = 'flex'
                }}
              />
            ) : null}
            {(!profile.avatar_url || profile.avatar_url === '') && (
              <div className="profile-avatar placeholder">👤</div>
            )}
            {!isOwnProfile && currentUser && (
              <div className="follow-button-container">
                {profile.is_following ? (
                  <button className="unfollow-btn" onClick={handleUnfollow}>
                    Unfollow
                  </button>
                ) : (
                  <button className="follow-btn" onClick={handleFollow}>
                    Follow
                  </button>
                )}
                {blockStatus.isBlocked ? (
                  <button className="unblock-btn" onClick={handleUnblock} title="Unblock user">
                    🚫 Unblock
                  </button>
                ) : (
                  <button className="block-btn" onClick={handleBlock} title="Block user">
                    🚫 Block
                  </button>
                )}
                {blockStatus.isMuted ? (
                  <button className="unmute-btn" onClick={handleUnmute} title="Unmute user">
                    🔇 Unmute
                  </button>
                ) : (
                  <button className="mute-btn" onClick={handleMute} title="Mute user">
                    🔇 Mute
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="profile-details">
            <div className="profile-name-section">
              <h1>{profile.display_name || profile.username}</h1>
            </div>
            <p className="username">@{profile.username}</p>
            {profile.bio && <p className="bio">{profile.bio}</p>}

            <div className="profile-stats">
              <div className="stat" onClick={handleShowFollowers}>
                <span className="stat-value">{profile.followers_count || 0}</span>
                <span className="stat-label">Followers</span>
              </div>
              <div className="stat" onClick={handleShowFollowing}>
                <span className="stat-value">{profile.following_count || 0}</span>
                <span className="stat-label">Following</span>
              </div>
              <div className="stat">
                <span className="stat-value">{profile.posts_count || 0}</span>
                <span className="stat-label">Posts</span>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-tabs">
          <button 
            className={`tab ${activeTab === 'posts' ? 'active' : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            Posts
          </button>
        </div>

        <div className="profile-content">
          {activeTab === 'posts' && (
            <div className="posts-grid">
              {posts.length === 0 ? (
                <div className="no-posts">No posts yet</div>
              ) : (
                posts.map(post => (
                  <div 
                    key={post.id} 
                    className="post-card-mini"
                    onClick={() => navigate(`/post/${post.id}`)}
                  >
                    {post.image_url && (
                      <img 
                        src={`http://localhost:3000${post.image_url}`} 
                        alt="Post" 
                        className="post-thumbnail"
                      />
                    )}
                    <div className="post-preview">
                      <p>{post.content.substring(0, 100)}{post.content.length > 100 ? '...' : ''}</p>
                      <span className="post-meta">{formatTime(post.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {showFollowers && (
        <div className="modal-overlay" onClick={() => setShowFollowers(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Followers</h2>
            <button className="close-btn" onClick={() => setShowFollowers(false)}>×</button>
            <div className="users-list">
              {followers.length === 0 ? (
                <p>No followers yet</p>
              ) : (
                followers.map(follower => (
                  <div 
                    key={follower.id} 
                    className="user-item"
                    onClick={() => {
                      setShowFollowers(false)
                      navigate(`/user/${follower.username}`)
                    }}
                  >
                    {follower.avatar_url ? (
                      <img src={follower.avatar_url} alt={follower.username} className="user-avatar-small" />
                    ) : (
                      <div className="user-avatar-small placeholder">👤</div>
                    )}
                    <div>
                      <strong>@{follower.username}</strong>
                      {follower.display_name && <p>{follower.display_name}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showFollowing && (
        <div className="modal-overlay" onClick={() => setShowFollowing(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Following</h2>
            <button className="close-btn" onClick={() => setShowFollowing(false)}>×</button>
            <div className="users-list">
              {following.length === 0 ? (
                <p>Not following anyone yet</p>
              ) : (
                following.map(followed => (
                  <div 
                    key={followed.id} 
                    className="user-item"
                    onClick={() => {
                      setShowFollowing(false)
                      navigate(`/user/${followed.username}`)
                    }}
                  >
                    {followed.avatar_url ? (
                      <img src={followed.avatar_url} alt={followed.username} className="user-avatar-small" />
                    ) : (
                      <div className="user-avatar-small placeholder">👤</div>
                    )}
                    <div>
                      <strong>@{followed.username}</strong>
                      {followed.display_name && <p>{followed.display_name}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {alert && <Alert message={alert.message} type={alert.type} onClose={hideAlert} />}
    </div>
  )
}

export default UserProfilePage

