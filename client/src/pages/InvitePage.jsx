import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './InvitePage.css'

const API_BASE = 'http://localhost:3000/api'

function InvitePage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (code) {
      fetchInvite()
    }
  }, [code])

  const fetchInvite = async () => {
    try {
      const response = await fetch(`${API_BASE}/invites/${code}`)
      if (response.ok) {
        const data = await response.json()
        setInvite(data.invite)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Invite not found')
      }
    } catch (error) {
      console.error('Failed to fetch invite:', error)
      setError('Failed to load invite')
    } finally {
      setLoading(false)
    }
  }

  const acceptInvite = async () => {
    if (!token) {
      // Redirect to login
      navigate('/login', { state: { returnTo: `/invite/${code}` } })
      return
    }

    setAccepting(true)
    try {
      const response = await fetch(`${API_BASE}/invites/${code}/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.already_member) {
          // Already a member, just redirect
          navigate(`/carlcord?server=${data.server.id}`)
        } else {
          // Successfully joined, redirect to server
          navigate(`/carlcord?server=${data.server.id}`)
        }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to accept invite')
      }
    } catch (error) {
      console.error('Failed to accept invite:', error)
      setError('Failed to accept invite')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="invite-page">
        <div className="invite-container">
          <div className="loading-spinner">Loading invite...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="invite-page">
        <div className="invite-container">
          <div className="invite-error">
            <h2>❌ {error}</h2>
            <button onClick={() => navigate('/carlcord')} className="invite-btn">
              Go to Carlcord
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="invite-page">
      <div className="invite-container">
        <div className="invite-content">
          {invite.server_icon && (
            <img src={invite.server_icon} alt={invite.server_name} className="server-icon-large" />
          )}
          <h1>You've been invited to join</h1>
          <h2 className="server-name">{invite.server_name}</h2>
          <p className="invite-info">
            Created by {invite.created_by_username}
          </p>
          {invite.max_uses && (
            <p className="invite-stats">
              {invite.uses} of {invite.max_uses} uses
            </p>
          )}
          {invite.expires_at && (
            <p className="invite-expires">
              Expires: {new Date(invite.expires_at).toLocaleDateString()}
            </p>
          )}
          
          {user ? (
            <button
              onClick={acceptInvite}
              disabled={accepting}
              className="invite-btn primary"
            >
              {accepting ? 'Joining...' : 'Accept Invite'}
            </button>
          ) : (
            <div className="invite-auth-prompt">
              <p>You need to be logged in to join this server</p>
              <button
                onClick={() => navigate('/login', { state: { returnTo: `/invite/${code}` } })}
                className="invite-btn primary"
              >
                Log In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default InvitePage
