import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import Alert from '../components/Alert'
import './CommunitiesPage.css'

const API_BASE = 'http://localhost:3000/api'

function CommunitiesPage() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { alert, showAlert, hideAlert, showLoginAlert } = useAlert()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('popular')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCommunity, setNewCommunity] = useState({
    name: '',
    description: '',
    icon: '🎮',
    is_public: 1
  })

  useEffect(() => {
    fetchCommunities()
  }, [search, sort])

  const fetchCommunities = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort, ...(search && { search }) })
      const response = await fetch(`${API_BASE}/communities?${params}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch communities')
      }
      const data = await response.json()
      // Ensure data is an array
      setCommunities(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch communities:', error)
      showAlert(error.message || 'Failed to load communities', 'error')
      setCommunities([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCommunity = async (e) => {
    e.preventDefault()
    if (!user) {
      showLoginAlert()
      return
    }

    try {
      const response = await fetch(`${API_BASE}/communities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newCommunity)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create community')
      }

      const community = await response.json()
      showAlert('Community created!', 'success')
      setShowCreateModal(false)
      setNewCommunity({ name: '', description: '', icon: '🎮', is_public: 1 })
      navigate(`/communities/${community.slug}`)
    } catch (error) {
      showAlert(error.message, 'error')
    }
  }

  const handleJoin = async (slug) => {
    if (!user) {
      showLoginAlert()
      return
    }

    try {
      console.log('Joining community:', slug)
      const response = await fetch(`${API_BASE}/communities/${slug}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      
      if (!response.ok) {
        // If already a member, just refresh the list (don't show error)
        if (data.error === 'Already a member' || data.already_member) {
          console.log('Already a member, refreshing...')
          await fetchCommunities()
          return
        }
        throw new Error(data.error || 'Failed to join community')
      }

      // Check if already member (from the new response format)
      if (data.already_member) {
        console.log('Already a member')
        await fetchCommunities()
        return
      }

      console.log('Successfully joined!')
      showAlert('✅ Joined community!', 'success')
      // Refresh the list to update the button state
      await fetchCommunities()
    } catch (error) {
      console.error('Join error:', error)
      showAlert(error.message, 'error')
    }
  }

  const handleLeave = async (slug) => {
    try {
      console.log('Leaving community:', slug)
      const response = await fetch(`${API_BASE}/communities/${slug}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to leave community')
      }

      console.log('Successfully left!')
      showAlert('Left community', 'success')
      await fetchCommunities()
    } catch (error) {
      console.error('Leave error:', error)
      showAlert(error.message, 'error')
    }
  }

  return (
    <div className="communities-page">
      <header className="communities-header">
        <div className="communities-header-content">
          <button className="back-btn" onClick={() => navigate('/')}>
            ← Back
          </button>
          <h1>Communities</h1>
          {user && (
            <button 
              className="create-community-btn"
              onClick={() => setShowCreateModal(true)}
            >
              + Create Community
            </button>
          )}
        </div>
        
        <div className="communities-filters">
          <input
            type="text"
            placeholder="Search communities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="sort-select">
            <option value="popular">Popular</option>
            <option value="new">Newest</option>
            <option value="active">Most Active</option>
          </select>
        </div>
      </header>

      <div className="communities-grid">
        {loading ? (
          <div className="loading">Loading communities...</div>
        ) : communities.length === 0 ? (
          <div className="no-communities">No communities found</div>
        ) : (
          communities.map(community => (
            <div key={community.id} className="community-card">
              <div className="community-header">
                <div className="community-icon">{community.icon || '🎮'}</div>
                <div className="community-info">
                  <h3 
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/communities/${community.slug}`)
                    }}
                  >
                    {community.name}
                  </h3>
                  <p className="community-owner">by @{community.owner_username}</p>
                </div>
              </div>
              
              {community.description && (
                <p className="community-description">{community.description}</p>
              )}
              
              <div className="community-stats">
                <span>👥 {community.member_count || 0} members</span>
                <span>📮 {community.post_count || 0} posts</span>
              </div>
              
              <div className="community-actions">
                {community.is_member > 0 ? (
                  <>
                    <button 
                      className="view-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/communities/${community.slug}`)
                      }}
                    >
                      View
                    </button>
                    <button 
                      className="leave-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLeave(community.slug)
                      }}
                    >
                      Leave
                    </button>
                  </>
                ) : (
                  <button 
                    className="join-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleJoin(community.slug)
                    }}
                    type="button"
                  >
                    Join
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create Community</h2>
            <form onSubmit={handleCreateCommunity}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newCommunity.name}
                  onChange={(e) => setNewCommunity({ ...newCommunity, name: e.target.value })}
                  required
                  maxLength={50}
                />
              </div>
              
              <div className="form-group">
                <label>Icon (emoji)</label>
                <input
                  type="text"
                  value={newCommunity.icon}
                  onChange={(e) => setNewCommunity({ ...newCommunity, icon: e.target.value })}
                  maxLength={2}
                  placeholder="🎮"
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newCommunity.description}
                  onChange={(e) => setNewCommunity({ ...newCommunity, description: e.target.value })}
                  rows={3}
                  maxLength={500}
                />
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="radio"
                    checked={newCommunity.is_public === 1}
                    onChange={() => setNewCommunity({ ...newCommunity, is_public: 1 })}
                  />
                  Public
                </label>
                <label>
                  <input
                    type="radio"
                    checked={newCommunity.is_public === 0}
                    onChange={() => setNewCommunity({ ...newCommunity, is_public: 0 })}
                  />
                  Private
                </label>
              </div>
              
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {alert.isOpen && (
        <Alert 
          isOpen={alert.isOpen}
          message={alert.message} 
          type={alert.type} 
          onClose={hideAlert}
          duration={alert.duration}
        />
      )}
    </div>
  )
}

export default CommunitiesPage

