import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { createPortal } from 'react-dom'
import './InviteModal.css'

const API_BASE = 'http://localhost:3000/api'

function InviteModal({ server, onClose }) {
  const { token } = useAuth()
  const [invites, setInvites] = useState([])
  const [maxUses, setMaxUses] = useState('')
  const [expiresIn, setExpiresIn] = useState('')
  const [loading, setLoading] = useState(false)
  const [newInvite, setNewInvite] = useState(null)

  useEffect(() => {
    if (server) {
      fetchInvites()
    }
  }, [server, token])

  const fetchInvites = async () => {
    try {
      const response = await fetch(`${API_BASE}/invites/server/${server.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setInvites(data.invites || [])
      }
    } catch (error) {
      console.error('Failed to fetch invites:', error)
    }
  }

  const createInvite = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const expiresInSeconds = expiresIn ? parseInt(expiresIn) * 3600 : null
      const response = await fetch(`${API_BASE}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          server_id: server.id,
          max_uses: maxUses ? parseInt(maxUses) : null,
          expires_in: expiresInSeconds
        })
      })

      if (response.ok) {
        const data = await response.json()
        setNewInvite(data.invite)
        setMaxUses('')
        setExpiresIn('')
        fetchInvites()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create invite')
      }
    } catch (error) {
      console.error('Create invite error:', error)
      alert('Failed to create invite')
    } finally {
      setLoading(false)
    }
  }

  const copyInviteLink = (code) => {
    const link = `${window.location.origin}/invite/${code}`
    navigator.clipboard.writeText(link).then(() => {
      alert('Invite link copied!')
    })
  }

  const deleteInvite = async (inviteId) => {
    if (!confirm('Delete this invite?')) return

    try {
      const response = await fetch(`${API_BASE}/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchInvites()
      }
    } catch (error) {
      console.error('Delete invite error:', error)
    }
  }

  if (!server) return null

  return createPortal(
    <div className="carlcord-modal-overlay" onClick={onClose}>
      <div className="carlcord-modal invite-modal" onClick={(e) => e.stopPropagation()}>
        <div className="carlcord-modal-header">
          <h2>Invite People to {server.name}</h2>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="invite-modal-content">
          {/* Create New Invite */}
          <div className="create-invite-section">
            <h3>Create Invite</h3>
            <form onSubmit={createInvite} className="invite-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Max Uses (Optional)</label>
                  <input
                    type="number"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    className="carlcord-modal-input"
                    placeholder="Unlimited"
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Expires In (Hours, Optional)</label>
                  <input
                    type="number"
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(e.target.value)}
                    className="carlcord-modal-input"
                    placeholder="Never"
                    min="1"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="carlcord-modal-btn primary"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Invite'}
              </button>
            </form>

            {newInvite && (
              <div className="new-invite-display">
                <p>New invite created!</p>
                <div className="invite-link-box">
                  <code>{window.location.origin}/invite/{newInvite.code}</code>
                  <button
                    className="copy-btn"
                    onClick={() => copyInviteLink(newInvite.code)}
                  >
                    📋 Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Existing Invites */}
          <div className="existing-invites-section">
            <h3>Active Invites</h3>
            {invites.length === 0 ? (
              <p className="no-invites">No active invites</p>
            ) : (
              <div className="invites-list">
                {invites.map(invite => (
                  <div key={invite.id} className="invite-item">
                    <div className="invite-info">
                      <code className="invite-code">{invite.code}</code>
                      <span className="invite-stats">
                        Uses: {invite.uses}{invite.max_uses ? `/${invite.max_uses}` : ''}
                        {invite.expires_at && (
                          <span> • Expires: {new Date(invite.expires_at).toLocaleDateString()}</span>
                        )}
                      </span>
                    </div>
                    <div className="invite-actions">
                      <button
                        className="copy-btn small"
                        onClick={() => copyInviteLink(invite.code)}
                        title="Copy link"
                      >
                        📋
                      </button>
                      <button
                        className="delete-btn small"
                        onClick={() => deleteInvite(invite.id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default InviteModal
