import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { createPortal } from 'react-dom'
import './ServerSettingsModal.css'

const API_BASE = 'http://localhost:3000/api'

function ServerSettingsModal({ server, onClose, onUpdate }) {
  const { token } = useAuth()
  const [name, setName] = useState(server?.name || '')
  const [description, setDescription] = useState(server?.description || '')
  const [icon, setIcon] = useState(server?.icon || '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (server) {
      setName(server.name || '')
      setDescription(server.description || '')
      setIcon(server.icon || '')
    }
  }, [server])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      alert('Server name is required')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/servers/${server.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          icon: icon.trim() || null
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (onUpdate) onUpdate(data.server)
        onClose()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to update server')
      }
    } catch (error) {
      console.error('Update server error:', error)
      alert('Failed to update server')
    } finally {
      setLoading(false)
    }
  }

  if (!server) return null

  return createPortal(
    <div className="carlcord-modal-overlay" onClick={onClose}>
      <div className="carlcord-modal server-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="carlcord-modal-header">
          <h2>Server Settings</h2>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="server-settings-form">
          <div className="form-group">
            <label>Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="carlcord-modal-input"
              placeholder="My Awesome Server"
              maxLength={100}
              required
            />
          </div>

          <div className="form-group">
            <label>Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="carlcord-modal-input"
              placeholder="What's this server about?"
              maxLength={500}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Server Icon URL (Optional)</label>
            <input
              type="url"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="carlcord-modal-input"
              placeholder="https://example.com/icon.png"
            />
            {icon && (
              <div className="icon-preview">
                <img src={icon} alt="Icon preview" onError={(e) => e.target.style.display = 'none'} />
              </div>
            )}
          </div>

          <div className="carlcord-modal-actions">
            <button
              type="button"
              className="carlcord-modal-btn cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="carlcord-modal-btn primary"
              disabled={loading || !name.trim()}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default ServerSettingsModal
