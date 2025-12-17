import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function AuthCallback() {
  const navigate = useNavigate()
  const { updateUser } = useAuth()

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const error = urlParams.get('error')

    if (error === 'banned') {
      localStorage.removeItem('carl_token')
      alert('Your account has been banned. You cannot access this platform.')
      navigate('/')
      return
    }

    if (token) {
      localStorage.setItem('carl_token', token)
      
      // Fetch user data
      fetch('http://localhost:3000/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => {
          if (res.status === 403) {
            // User is banned
            localStorage.removeItem('carl_token')
            return res.json().then(data => {
              alert(data.error || 'Your account has been banned. You cannot access this platform.')
              navigate('/')
            })
          }
          return res.json()
        })
        .then(userData => {
          if (userData && userData.id) {
            updateUser(userData)
            navigate('/')
          } else {
            navigate('/')
          }
        })
        .catch(() => {
          navigate('/')
        })
    } else {
      navigate('/')
    }
  }, [navigate, updateUser])

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      color: '#00ff41',
      fontFamily: 'Courier New, monospace'
    }}>
      Authenticating...
    </div>
  )
}

export default AuthCallback

