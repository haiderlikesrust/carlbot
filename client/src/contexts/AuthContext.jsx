import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(localStorage.getItem('carl_token'))

  useEffect(() => {
    if (token) {
      fetchUser()
    } else {
      setLoading(false)
    }
  }, [token])

  const fetchUser = async () => {
    if (!token) {
      setLoading(false)
      return
    }
    
    try {
      const response = await fetch('http://localhost:3000/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
      } else if (response.status === 403) {
        // User is banned
        const data = await response.json()
        localStorage.removeItem('carl_token')
        setToken(null)
        setUser(null)
        alert(data.error || 'Your account has been banned. You cannot access this platform.')
      } else if (response.status === 401) {
        // Token expired or invalid - try to refresh or clear
        console.warn('Token invalid, clearing auth')
        localStorage.removeItem('carl_token')
        setToken(null)
        setUser(null)
      } else {
        // Other error - don't clear token, might be temporary
        console.warn('Failed to fetch user, status:', response.status)
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      // Don't clear token on network errors - might be temporary
    } finally {
      setLoading(false)
    }
  }
  
  // Periodically refresh user data to keep session alive
  useEffect(() => {
    if (!token || !user) return
    
    const refreshInterval = setInterval(() => {
      fetchUser()
    }, 5 * 60 * 1000) // Refresh every 5 minutes
    
    return () => clearInterval(refreshInterval)
  }, [token, user])

  const login = async (email, password) => {
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        localStorage.setItem('carl_token', data.token)
        setToken(data.token)
        setUser(data.user)
        return { success: true }
      } else {
        // If banned, clear any existing token
        if (response.status === 403) {
          localStorage.removeItem('carl_token')
          setToken(null)
          setUser(null)
        }
        return { success: false, error: data.error }
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  }

  const signup = async (email, username, password) => {
    try {
      const response = await fetch('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        localStorage.setItem('carl_token', data.token)
        setToken(data.token)
        setUser(data.user)
        return { success: true }
      } else {
        return { success: false, error: data.error }
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  }

  const logout = () => {
    localStorage.removeItem('carl_token')
    setToken(null)
    setUser(null)
  }

  const updateUser = (userData) => {
    setUser(userData)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser, token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

