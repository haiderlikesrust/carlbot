import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './AuthModal.css'

function AuthModal({ isOpen, onClose, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, signup } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    let result
    if (mode === 'login') {
      result = await login(email, password)
    } else {
      result = await signup(email, username, password)
    }

    setLoading(false)

    if (result.success) {
      onClose()
      setEmail('')
      setUsername('')
      setPassword('')
    } else {
      setError(result.error || 'Authentication failed')
    }
  }

  const handleOAuth = (provider) => {
    window.location.href = `http://localhost:3000/api/auth/${provider}`
  }

  if (!isOpen) return null

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>{mode === 'login' ? 'Login' : 'Sign Up'}</h2>
          <button className="auth-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="auth-modal-content">
          {error && <div className="auth-error">{error}</div>}
          
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'signup' && (
              <div className="auth-field">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="Choose a username"
                />
              </div>
            )}
            
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
            </div>
            
            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
              />
            </div>
            
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? '...' : (mode === 'login' ? 'Login' : 'Sign Up')}
            </button>
          </form>
          
          <div className="auth-divider">
            <span>OR</span>
          </div>
          
          <div className="auth-oauth">
            <button 
              className="oauth-btn google-btn"
              onClick={() => handleOAuth('google')}
              type="button"
            >
              <span>🔵</span> Continue with Google
            </button>
            <button 
              className="oauth-btn discord-btn"
              onClick={() => handleOAuth('discord')}
              type="button"
            >
              <span>💜</span> Continue with Discord
            </button>
          </div>
          
          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => setMode('signup')} className="auth-link-btn">
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="auth-link-btn">
                  Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthModal

