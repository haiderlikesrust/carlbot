import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './ProfileModal.css'

function ProfileModal({ user: propUser, isOpen, onClose }) {
  const navigate = useNavigate()
  const { user, updateUser, token } = useAuth()
  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    favorite_games: [],
    theme_preference: 'dark',
    profile_color: '#00ff41'
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (user?.profile) {
      setFormData({
        display_name: user.profile.display_name || '',
        bio: user.profile.bio || '',
        favorite_games: user.profile.favorite_games || [],
        theme_preference: user.profile.theme_preference || 'dark',
        profile_color: user.profile.profile_color || '#00ff41'
      })
    }
  }, [user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { API_BASE } = await import('../config.js')
      const response = await fetch(`${API_BASE}/profiles/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const { API_BASE } = await import('../config.js')
        const updatedUser = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json())
        
        updateUser(updatedUser)
        setMessage('Profile updated successfully!')
        setTimeout(() => {
          onClose()
        }, 1000)
      } else {
        const data = await response.json()
        setMessage(data.error || 'Failed to update profile')
      }
    } catch (error) {
      setMessage('Network error')
    } finally {
      setLoading(false)
    }
  }

  // Support both isOpen prop and user prop (for Carlcord integration)
  if (!isOpen && !propUser) return null

  return createPortal(
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <h2>Edit Profile</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              className="profile-customize-btn"
              onClick={() => {
                onClose()
                navigate('/settings/profile')
              }}
              title="Open Full Customization"
            >
              ⚙️ Full Customization
            </button>
            <button className="profile-modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="profile-form">
          {message && (
            <div className={`profile-message ${message.includes('success') ? 'success' : 'error'}`}>
              {message}
            </div>
          )}
          
          <div className="profile-field">
            <label>Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="Your display name"
            />
          </div>
          
          <div className="profile-field">
            <label>Bio</label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Tell us about yourself..."
              rows={4}
            />
          </div>
          
          <div className="profile-field">
            <label>Profile Color</label>
            <div className="color-picker-wrapper">
              <input
                type="color"
                value={formData.profile_color}
                onChange={(e) => setFormData({ ...formData, profile_color: e.target.value })}
                className="color-picker"
              />
              <input
                type="text"
                value={formData.profile_color}
                onChange={(e) => setFormData({ ...formData, profile_color: e.target.value })}
                className="color-input"
                placeholder="#00ff41"
              />
            </div>
          </div>
          
          <div className="profile-field">
            <label>Theme Preference</label>
            <select
              value={formData.theme_preference}
              onChange={(e) => setFormData({ ...formData, theme_preference: e.target.value })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          
          <div className="profile-actions">
            <button type="button" className="profile-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="profile-save-btn" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default ProfileModal

