import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomAlert from '../components/CustomAlert'
import CustomPrompt from '../components/CustomPrompt'
import { showAlert, showConfirm, showPrompt } from '../utils/dialogs'
import './AdminPanel.css'

const API_BASE = 'http://localhost:3000/api'

function AdminPanel() {
  const navigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showLogin, setShowLogin] = useState(true)
  const [loginData, setLoginData] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [adminToken, setAdminToken] = useState(() => {
    return localStorage.getItem('admin_token')
  })
  const [activeTab, setActiveTab] = useState('dashboard')
  const [activity, setActivity] = useState([])
  const [stats, setStats] = useState(null)
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [activityFeed, setActivityFeed] = useState([])
  const [editingConfig, setEditingConfig] = useState(null)
  const [configValue, setConfigValue] = useState('')
  
  // New state for additional features
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [moderationPosts, setModerationPosts] = useState([])
  const [systemHealth, setSystemHealth] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [editingAchievement, setEditingAchievement] = useState(null)
  const [analyticsOverview, setAnalyticsOverview] = useState(null)
  const [schedulerStatus, setSchedulerStatus] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [decisionLogs, setDecisionLogs] = useState([])
  const [moderationLogs, setModerationLogs] = useState([])
  const [bannedUsers, setBannedUsers] = useState([])
  const [deletedContent, setDeletedContent] = useState({ posts: [], comments: [] })
  const [moderationStats, setModerationStats] = useState(null)
  const [customAlert, setCustomAlert] = useState({ isOpen: false, message: '', type: 'info', title: null })
  const [inputPrompt, setInputPrompt] = useState({ isOpen: false, message: '', placeholder: '', onConfirm: null })
  
  // Query Builder state
  const [databaseSchema, setDatabaseSchema] = useState(null)
  const [queryBuilder, setQueryBuilder] = useState({
    table: '',
    columns: [],
    filters: [],
    orderBy: { column: '', direction: 'ASC' },
    limit: 100,
    joins: []
  })
  const [queryResults, setQueryResults] = useState(null)
  const [queryError, setQueryError] = useState(null)
  
  // Features state
  const [features, setFeatures] = useState([])
  const [editingFeature, setEditingFeature] = useState(null)

  useEffect(() => {
    // Check if already authenticated
    if (adminToken) {
      verifyToken()
    } else {
      setIsLoading(false)
      setShowLogin(true)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboard()
      fetchSchedulerStatus()
      const interval = setInterval(() => {
        fetchActivityFeed()
        fetchSchedulerStatus()
      }, 1000) // Refresh every second for countdown
      return () => clearInterval(interval)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (schedulerStatus?.countdown) {
      const timer = setInterval(() => {
        const now = new Date()
        const nextRun = new Date(schedulerStatus.nextRun)
        const diff = nextRun.getTime() - now.getTime()
        
        if (diff > 0) {
          setCountdown({
            totalSeconds: Math.floor(diff / 1000),
            minutes: Math.floor(diff / 60000),
            seconds: Math.floor((diff % 60000) / 1000),
            formatted: `${Math.floor(diff / 60000)}:${String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')}`
          })
        } else {
          setCountdown(null)
          fetchSchedulerStatus() // Refresh status
        }
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [schedulerStatus])

  useEffect(() => {
    if (activeTab === 'activity') {
      fetchActivity()
    } else if (activeTab === 'config') {
      fetchConfig()
    } else if (activeTab === 'dashboard') {
      fetchDashboard()
    } else if (activeTab === 'users') {
      fetchUsers()
    } else if (activeTab === 'moderation') {
      fetchModerationPosts()
    } else if (activeTab === 'system') {
      fetchSystemHealth()
    } else if (activeTab === 'achievements') {
      fetchAchievements()
    } else if (activeTab === 'analytics') {
      fetchAnalyticsOverview()
    } else if (activeTab === 'decisions') {
      fetchDecisionLogs()
    } else if (activeTab === 'query-builder') {
      fetchDatabaseSchema()
    } else if (activeTab === 'features') {
      fetchFeatures()
    }
  }, [activeTab, adminToken])

  useEffect(() => {
    if (activeTab === 'users') {
      const timer = setTimeout(() => {
        fetchUsers()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [userSearch, activeTab])

  const fetchDashboard = async () => {
    try {
      const [statsRes, feedRes] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        }),
        fetch(`${API_BASE}/admin/activity/feed?limit=10`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        })
      ])
      
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }
      
      if (feedRes.ok) {
        const feedData = await feedRes.json()
        setActivityFeed(feedData)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchActivity = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/activity?limit=100`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setActivity(data.activities)
      }
    } catch (error) {
      console.error('Failed to fetch activity:', error)
    }
  }

  const fetchActivityFeed = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/activity/feed?limit=20`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setActivityFeed(data)
      }
    } catch (error) {
      console.error('Failed to fetch activity feed:', error)
    }
  }

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/config`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setConfig(data)
      }
    } catch (error) {
      console.error('Failed to fetch config:', error)
    }
  }

  const updateConfig = async (key) => {
    try {
      const response = await fetch(`${API_BASE}/admin/config`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ configKey: key, configValue })
      })
      
      if (response.ok) {
        await fetchConfig()
        setEditingConfig(null)
        setConfigValue('')
        showAlert('Configuration updated successfully!', 'success')
      } else {
        showAlert('Failed to update configuration', 'error')
      }
    } catch (error) {
      console.error('Failed to update config:', error)
      showAlert('Error updating configuration', 'error')
    }
  }

  const triggerAction = async (action, params = {}) => {
    try {
      const response = await fetch(`${API_BASE}/admin/trigger/${action}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(params)
      })
      
      if (response.ok) {
        const data = await response.json()
        showAlert('Action triggered successfully!', 'success')
        fetchDashboard()
        return data
      } else {
        const error = await response.json()
        showAlert(`Failed: ${error.error || 'Unknown error'}`, 'error')
      }
    } catch (error) {
      console.error('Failed to trigger action:', error)
      showAlert('Error triggering action', 'error')
    }
  }

  const verifyToken = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/verify`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      if (response.ok) {
        setIsAuthenticated(true)
        setShowLogin(false)
      } else {
        // Token invalid, clear it
        localStorage.removeItem('admin_token')
        setAdminToken(null)
        setShowLogin(true)
      }
    } catch (error) {
      console.error('Token verification failed:', error)
      localStorage.removeItem('admin_token')
      setAdminToken(null)
      setShowLogin(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    
    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        localStorage.setItem('admin_token', data.token)
        setAdminToken(data.token)
        setIsAuthenticated(true)
        setShowLogin(false)
        setLoginError('')
      } else {
        setLoginError(data.error || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      setLoginError('Connection error. Please try again.')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    setAdminToken(null)
    setIsAuthenticated(false)
    setShowLogin(true)
    setLoginData({ username: '', password: '' })
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/users?search=${encodeURIComponent(userSearch)}&limit=50`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const fetchUserDetails = async (userId) => {
    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setSelectedUser(data)
      }
    } catch (error) {
      console.error('Failed to fetch user details:', error)
    }
  }

  const banUser = async (userId, reason = '') => {
    showConfirm(
      'Are you sure you want to ban this user?',
      async () => {
    
    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      })
        if (response.ok) {
          showAlert('User banned successfully', 'success')
          fetchUsers()
        } else {
          showAlert('Failed to ban user', 'error')
        }
      } catch (error) {
        console.error('Failed to ban user:', error)
        showAlert('Failed to ban user', 'error')
      }
    },
    'Ban User?'
  )
  }

  const deleteUser = async (userId) => {
    showConfirm(
      'Are you sure you want to DELETE this user? This action cannot be undone!',
      async () => {
    
    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
        if (response.ok) {
          showAlert('User deleted successfully', 'success')
          fetchUsers()
          setSelectedUser(null)
        } else {
          showAlert('Failed to delete user', 'error')
        }
      } catch (error) {
        console.error('Failed to delete user:', error)
        showAlert('Failed to delete user', 'error')
      }
    },
    'Delete User?'
  )
  }

  const fetchModerationPosts = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/posts?limit=50`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setModerationPosts(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch moderation posts:', error)
    }
  }

  const deletePost = async (postId) => {
    showConfirm(
      'Are you sure you want to delete this post?',
      async () => {
    
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
        if (response.ok) {
          showAlert('Post deleted successfully', 'success')
          fetchModerationPosts()
        } else {
          showAlert('Failed to delete post', 'error')
        }
      } catch (error) {
        console.error('Failed to delete post:', error)
        showAlert('Failed to delete post', 'error')
      }
    },
    'Delete Post?'
  )
  }

  const fetchSystemHealth = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/system/health`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setSystemHealth(data)
      }
    } catch (error) {
      console.error('Failed to fetch system health:', error)
    }
  }

  const fetchAchievements = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/achievements`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setAchievements(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch achievements:', error)
    }
  }

  const createAchievement = async (achievementData) => {
    try {
      const response = await fetch(`${API_BASE}/admin/achievements`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(achievementData)
      })
      if (response.ok) {
        alert('Achievement created successfully')
        fetchAchievements()
      }
    } catch (error) {
      console.error('Failed to create achievement:', error)
      alert('Failed to create achievement')
    }
  }

  const deleteAchievement = async (achievementId) => {
    if (!confirm('Are you sure you want to delete this achievement?')) return
    
    try {
      const response = await fetch(`${API_BASE}/admin/achievements/${achievementId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        alert('Achievement deleted successfully')
        fetchAchievements()
      }
    } catch (error) {
      console.error('Failed to delete achievement:', error)
      alert('Failed to delete achievement')
    }
  }

  const fetchAnalyticsOverview = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/analytics/overview`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setAnalyticsOverview(data)
      }
    } catch (error) {
      console.error('Failed to fetch analytics overview:', error)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/scheduler/status`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setSchedulerStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch scheduler status:', error)
    }
  }

  const fetchDecisionLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/decisions?limit=100`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDecisionLogs(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch decision logs:', error)
    }
  }

  const fetchModerationLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/logs?limit=100`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setModerationLogs(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch moderation logs:', error)
    }
  }

  const fetchBannedUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/banned`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setBannedUsers(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch banned users:', error)
    }
  }

  const fetchDeletedContent = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/deleted?type=all&limit=50`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDeletedContent(data || { posts: [], comments: [] })
      }
    } catch (error) {
      console.error('Failed to fetch deleted content:', error)
    }
  }

  const fetchModerationStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/stats`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setModerationStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch moderation stats:', error)
    }
  }

  const showAlert = (message, type = 'info', title = null) => {
    setCustomAlert({ isOpen: true, message, type, title })
  }

  const hideAlert = () => {
    setCustomAlert({ isOpen: false, message: '', type: 'info', title: null })
  }

  const showConfirm = (message, onConfirm, title = 'Confirm') => {
    setCustomAlert({
      isOpen: true,
      message,
      type: 'question',
      title,
      onConfirm: () => {
        hideAlert()
        if (onConfirm) onConfirm()
      },
      onCancel: () => {
        hideAlert()
      }
    })
  }

  const handleManualModerationCheck = async () => {
    showConfirm(
      'Run moderation check on recent content (last hour)? This will check all recent posts and comments.',
      async () => {
        try {
          const response = await fetch(`${API_BASE}/admin/moderation/check`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'recent', limit: 100 })
          })
          
          if (response.ok) {
            const data = await response.json()
            let message = 'Moderation check completed!\n\n'
            if (data.banned && data.banned.length > 0) {
              message += `Banned ${data.banned.length} user(s)\n`
            }
            if (data.posts && data.posts.length > 0) {
              message += `Deleted ${data.posts.length} post(s)\n`
            }
            if (data.comments && data.comments.length > 0) {
              message += `Deleted ${data.comments.length} comment(s)\n`
            }
            if ((!data.banned || data.banned.length === 0) && 
                (!data.posts || data.posts.length === 0) && 
                (!data.comments || data.comments.length === 0)) {
              message += 'No violations found.'
            }
            showAlert(message, 'success', 'Moderation Check Complete')
            
            // Refresh the logs
            fetchModerationLogs()
            fetchBannedUsers()
            fetchDeletedContent()
            fetchModerationStats()
          } else {
            const error = await response.json()
            showAlert(`Failed: ${error.error || 'Unknown error'}`, 'error', 'Error')
          }
        } catch (error) {
          console.error('Manual moderation check error:', error)
          showAlert(`Failed to run moderation check: ${error.message}`, 'error', 'Error')
        }
      },
      'Run Moderation Check?'
    )
  }

  const handleCheckSpecificPost = async (postId) => {
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'post', id: postId })
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.action === 'banned_and_deleted') {
          showAlert(
            `Post ${postId} contained racist content!\n\nUser ${data.userId} has been banned.\nReason: ${data.reason}`,
            'error',
            '⚠️ Content Violation Detected'
          )
        } else {
          showAlert(
            `Post ${postId} is clean - no violations found.`,
            'success',
            '✅ Content Approved'
          )
        }
        
        // Refresh the logs
        fetchModerationLogs()
        fetchBannedUsers()
        fetchDeletedContent()
        fetchModerationStats()
      } else {
        const error = await response.json()
        showAlert(`Failed: ${error.error || 'Unknown error'}`, 'error', 'Error')
      }
    } catch (error) {
      console.error('Check post error:', error)
      showAlert(`Failed to check post: ${error.message}`, 'error', 'Error')
    }
  }

  const handleCheckSpecificComment = async (commentId) => {
    try {
      const response = await fetch(`${API_BASE}/admin/moderation/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'comment', id: commentId })
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.action === 'banned_and_deleted') {
          showAlert(
            `Comment ${commentId} contained racist content!\n\nUser ${data.userId} has been banned.\nReason: ${data.reason}`,
            'error',
            '⚠️ Content Violation Detected'
          )
        } else {
          showAlert(
            `Comment ${commentId} is clean - no violations found.`,
            'success',
            '✅ Content Approved'
          )
        }
        
        // Refresh the logs
        fetchModerationLogs()
        fetchBannedUsers()
        fetchDeletedContent()
        fetchModerationStats()
      } else {
        const error = await response.json()
        showAlert(`Failed: ${error.error || 'Unknown error'}`, 'error', 'Error')
      }
    } catch (error) {
      console.error('Check comment error:', error)
      showAlert(`Failed to check comment: ${error.message}`, 'error', 'Error')
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'like': return '👍'
      case 'comment': return '💬'
      case 'retweet': return '🔄'
      case 'create_post': return '📝'
      case 'config_update': return '⚙️'
      default: return '🤖'
    }
  }

  const fetchDatabaseSchema = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/database/schema`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDatabaseSchema(data)
      }
    } catch (error) {
      console.error('Failed to fetch database schema:', error)
    }
  }

  const executeQuery = async () => {
    setQueryError(null)
    setQueryResults(null)
    
    try {
      const response = await fetch(`${API_BASE}/admin/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(queryBuilder)
      })
      
      if (response.ok) {
        const data = await response.json()
        setQueryResults(data)
      } else {
        const error = await response.json()
        setQueryError(error.error || 'Query failed')
      }
    } catch (error) {
      console.error('Query execution error:', error)
      setQueryError(error.message || 'Failed to execute query')
    }
  }

  const addFilter = () => {
    setQueryBuilder(prev => ({
      ...prev,
      filters: [...prev.filters, { column: '', operator: 'equals', value: '' }]
    }))
  }

  const removeFilter = (index) => {
    setQueryBuilder(prev => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index)
    }))
  }

  const updateFilter = (index, field, value) => {
    setQueryBuilder(prev => ({
      ...prev,
      filters: prev.filters.map((filter, i) => 
        i === index ? { ...filter, [field]: value } : filter
      )
    }))
  }

  const addColumn = () => {
    setQueryBuilder(prev => ({
      ...prev,
      columns: [...prev.columns, '']
    }))
  }

  const removeColumn = (index) => {
    setQueryBuilder(prev => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index)
    }))
  }

  const updateColumn = (index, value) => {
    setQueryBuilder(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) => i === index ? value : col)
    }))
  }

  const fetchFeatures = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/features`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setFeatures(data)
      }
    } catch (error) {
      console.error('Failed to fetch features:', error)
    }
  }

  const toggleFeature = async (featureKey, enabled) => {
    try {
      const response = await fetch(`${API_BASE}/admin/features/${featureKey}/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ enabled: !enabled })
      })
      
      if (response.ok) {
        fetchFeatures()
        showAlert(`Feature ${!enabled ? 'enabled' : 'disabled'} successfully!`, 'success')
      } else {
        showAlert('Failed to toggle feature', 'error')
      }
    } catch (error) {
      console.error('Toggle feature error:', error)
      showAlert('Error toggling feature', 'error')
    }
  }

  const createFeature = async (featureData) => {
    try {
      const response = await fetch(`${API_BASE}/admin/features`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(featureData)
      })
      
      if (response.ok) {
        fetchFeatures()
        setEditingFeature(null)
        showAlert('Feature created successfully!', 'success')
      } else {
        const error = await response.json()
        showAlert(error.error || 'Failed to create feature', 'error')
      }
    } catch (error) {
      console.error('Create feature error:', error)
      showAlert('Error creating feature', 'error')
    }
  }

  const deleteFeature = async (featureKey) => {
    showConfirm(
      'Are you sure you want to delete this feature?',
      async () => {
        try {
          const response = await fetch(`${API_BASE}/admin/features/${featureKey}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          
          if (response.ok) {
            fetchFeatures()
            showAlert('Feature deleted successfully!', 'success')
          } else {
            showAlert('Failed to delete feature', 'error')
          }
        } catch (error) {
          console.error('Delete feature error:', error)
          showAlert('Error deleting feature', 'error')
        }
      },
      'Delete Feature?'
    )
  }

  if (isLoading) {
    return <div className="admin-panel-loading">Loading admin panel...</div>
  }

  if (showLogin || !isAuthenticated) {
    return (
      <div className="admin-panel">
        <div className="admin-login-container">
          <div className="admin-login-box">
            <h1>🔐 Admin Login</h1>
            <p className="login-subtitle">Carlbot Admin Panel</p>
            
            <form onSubmit={handleLogin} className="login-form">
              {loginError && (
                <div className="login-error">{loginError}</div>
              )}
              
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  value={loginData.username}
                  onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                  required
                  autoFocus
                  className="login-input"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  required
                  className="login-input"
                />
              </div>
              
              <button type="submit" className="login-submit-btn">
                Login
              </button>
            </form>
            
            <button className="back-btn" onClick={() => navigate('/')}>
              ← Back to App
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>🤖 Carlbot Admin Panel</h1>
        <div className="header-actions">
          <button className="logout-btn" onClick={handleLogout}>
            🚪 Logout
          </button>
          <button className="back-btn" onClick={() => navigate('/')}>
            ← Back
          </button>
        </div>
      </div>

      <div className="admin-tabs">
        <button 
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={activeTab === 'activity' ? 'active' : ''}
          onClick={() => setActiveTab('activity')}
        >
          📋 Activity Log
        </button>
        <button 
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button 
          className={activeTab === 'moderation' ? 'active' : ''}
          onClick={() => setActiveTab('moderation')}
        >
          🛡️ Moderation
        </button>
        <button 
          className={activeTab === 'system' ? 'active' : ''}
          onClick={() => setActiveTab('system')}
        >
          💻 System Health
        </button>
        <button 
          className={activeTab === 'achievements' ? 'active' : ''}
          onClick={() => setActiveTab('achievements')}
        >
          🏆 Achievements
        </button>
        <button 
          className={activeTab === 'analytics' ? 'active' : ''}
          onClick={() => setActiveTab('analytics')}
        >
          📈 Analytics
        </button>
        <button 
          className={activeTab === 'config' ? 'active' : ''}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Configuration
        </button>
        <button 
          className={activeTab === 'actions' ? 'active' : ''}
          onClick={() => setActiveTab('actions')}
        >
          🎮 Manual Actions
        </button>
        <button 
          className={activeTab === 'decisions' ? 'active' : ''}
          onClick={() => setActiveTab('decisions')}
        >
          🧠 Decision Logs
        </button>
        <button 
          className={activeTab === 'moderation-logs' ? 'active' : ''}
          onClick={() => setActiveTab('moderation-logs')}
        >
          🛡️ Moderation Logs
        </button>
        <button 
          className={activeTab === 'query-builder' ? 'active' : ''}
          onClick={() => setActiveTab('query-builder')}
        >
          🔍 Query Builder
        </button>
        <button 
          className={activeTab === 'features' ? 'active' : ''}
          onClick={() => setActiveTab('features')}
        >
          ⚡ Features
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && (
          <div className="dashboard">
            {schedulerStatus && (
              <div className="scheduler-status-card">
                <h2>⏰ Scheduler Status</h2>
                <div className="scheduler-info">
                  <div className="scheduler-item">
                    <span className="scheduler-label">Status:</span>
                    <span className={`scheduler-value ${schedulerStatus.isRunning ? 'running' : 'idle'}`}>
                      {schedulerStatus.isRunning ? '🟢 Running' : '⚪ Idle'}
                    </span>
                  </div>
                  {schedulerStatus.nextRun && (
                    <div className="scheduler-item">
                      <span className="scheduler-label">Next Run:</span>
                      <span className="scheduler-value">
                        {new Date(schedulerStatus.nextRun).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {countdown && (
                    <div className="scheduler-item countdown">
                      <span className="scheduler-label">Countdown:</span>
                      <span className="scheduler-value countdown-value">
                        {countdown.formatted || `${countdown.minutes}:${String(countdown.seconds).padStart(2, '0')}`}
                      </span>
                    </div>
                  )}
                  {schedulerStatus.lastRun && (
                    <div className="scheduler-item">
                      <span className="scheduler-label">Last Run:</span>
                      <span className="scheduler-value">
                        {formatDate(schedulerStatus.lastRun)}
                      </span>
                    </div>
                  )}
                  {schedulerStatus.lastRunResult && (
                    <div className="scheduler-item">
                      <span className="scheduler-label">Last Result:</span>
                      <span className="scheduler-value">
                        {schedulerStatus.lastRunResult.success ? '✅' : '❌'} 
                        {schedulerStatus.lastRunResult.interactions !== undefined && 
                          ` ${schedulerStatus.lastRunResult.interactions} interactions`}
                        {schedulerStatus.lastRunResult.postCreated && 
                          ` • Post #${schedulerStatus.lastRunResult.postCreated} created`}
                      </span>
                    </div>
                  )}
                  <div className="scheduler-item">
                    <span className="scheduler-label">Interval:</span>
                    <span className="scheduler-value">
                      Every {schedulerStatus.intervalMinutes || 30} minutes
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Interactions</h3>
                <div className="stat-value">
                  {stats?.interactionStats ? 
                    (stats.interactionStats.total_likes || 0) + 
                    (stats.interactionStats.total_comments || 0) + 
                    (stats.interactionStats.total_retweets || 0) 
                    : 0}
                </div>
              </div>
              <div className="stat-card">
                <h3>Posts Created</h3>
                <div className="stat-value">{stats?.interactionStats?.total_posts || 0}</div>
              </div>
              <div className="stat-card">
                <h3>Avg Comment Likes</h3>
                <div className="stat-value">
                  {stats?.interactionStats?.avg_comment_likes 
                    ? Math.round(stats.interactionStats.avg_comment_likes * 10) / 10 
                    : 0}
                </div>
              </div>
              <div className="stat-card">
                <h3>Avg Post Likes</h3>
                <div className="stat-value">
                  {stats?.interactionStats?.avg_post_likes 
                    ? Math.round(stats.interactionStats.avg_post_likes * 10) / 10 
                    : 0}
                </div>
              </div>
            </div>

            <div className="recent-activity-section">
              <h2>Recent Activity</h2>
              <div className="activity-feed">
                {activityFeed.map((item) => (
                  <div key={item.id} className={`activity-item ${item.success ? 'success' : 'error'}`}>
                    <span className="activity-icon">{getActionIcon(item.action_type)}</span>
                    <div className="activity-details">
                      <div className="activity-action">{item.action_type}</div>
                      <div className="activity-desc">{item.action_details}</div>
                      {item.post_content && (
                        <div className="activity-target">Post: "{item.post_content.substring(0, 50)}..."</div>
                      )}
                      {item.comment_content && (
                        <div className="activity-target">Comment: "{item.comment_content.substring(0, 50)}..."</div>
                      )}
                      <div className="activity-time">{formatDate(item.created_at)}</div>
                    </div>
                    {!item.success && (
                      <div className="activity-error">{item.error_message}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {stats?.activityStats && stats.activityStats.length > 0 && (
              <div className="activity-stats-section">
                <h2>Activity by Type (Last 7 Days)</h2>
                <div className="activity-stats">
                  {stats.activityStats.map((stat) => (
                    <div key={stat.action_type} className="activity-stat-item">
                      <div className="stat-label">{stat.action_type}</div>
                      <div className="stat-bar">
                        <div 
                          className="stat-bar-fill" 
                          style={{ width: `${(stat.success_count / stat.count) * 100}%` }}
                        />
                      </div>
                      <div className="stat-numbers">
                        {stat.success_count} / {stat.count} ({stat.error_count} errors)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="activity-log">
            <div className="activity-filters">
              <select onChange={async (e) => {
                const actionType = e.target.value
                try {
                  const response = await fetch(`${API_BASE}/admin/activity?limit=100${actionType ? `&action_type=${actionType}` : ''}`, {
                    headers: { 'Authorization': `Bearer ${adminToken}` }
                  })
                  if (response.ok) {
                    const data = await response.json()
                    setActivity(data.activities)
                  }
                } catch (error) {
                  console.error('Failed to fetch filtered activity:', error)
                }
              }}>
                <option value="">All Actions</option>
                <option value="like">Likes</option>
                <option value="comment">Comments</option>
                <option value="retweet">Retweets</option>
                <option value="create_post">Posts Created</option>
                <option value="config_update">Config Updates</option>
              </select>
            </div>
            <div className="activity-list">
              {activity.map((item) => (
                <div key={item.id} className={`activity-item ${item.success ? 'success' : 'error'}`}>
                  <span className="activity-icon">{getActionIcon(item.action_type)}</span>
                  <div className="activity-details">
                    <div className="activity-header">
                      <span className="activity-action">{item.action_type}</span>
                      <span className="activity-time">{formatDate(item.created_at)}</span>
                    </div>
                    <div className="activity-desc">{item.action_details}</div>
                    {item.post_content && (
                      <div className="activity-target">Post: "{item.post_content.substring(0, 100)}..."</div>
                    )}
                    {item.comment_content && (
                      <div className="activity-target">Comment: "{item.comment_content.substring(0, 100)}..."</div>
                    )}
                    {item.metadata && (
                      <div className="activity-metadata">
                        <pre>{JSON.stringify(JSON.parse(item.metadata), null, 2)}</pre>
                      </div>
                    )}
                  </div>
                  {!item.success && (
                    <div className="activity-error">Error: {item.error_message}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="config-panel">
            <h2>Carlbot Configuration</h2>
            <div className="config-list">
              {Object.entries(config).map(([key, value]) => (
                <div key={key} className="config-item">
                  <div className="config-header">
                    <h3>{key}</h3>
                    {value.description && <p className="config-desc">{value.description}</p>}
                  </div>
                  {editingConfig === key ? (
                    <div className="config-edit">
                      {key === 'system_prompt' ? (
                        <textarea
                          value={configValue}
                          onChange={(e) => setConfigValue(e.target.value)}
                          rows={10}
                          className="config-textarea"
                        />
                      ) : (
                        <input
                          type="text"
                          value={configValue}
                          onChange={(e) => setConfigValue(e.target.value)}
                          className="config-input"
                        />
                      )}
                      <div className="config-actions">
                        <button onClick={() => updateConfig(key)} className="save-btn">
                          Save
                        </button>
                        <button onClick={() => {
                          setEditingConfig(null)
                          setConfigValue('')
                        }} className="cancel-btn">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="config-display">
                      <div className="config-value">
                        {key === 'system_prompt' ? (
                          <pre>{value.value}</pre>
                        ) : (
                          <span>{value.value}</span>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          setEditingConfig(key)
                          setConfigValue(value.value)
                        }}
                        className="edit-btn"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  {value.updatedAt && (
                    <div className="config-meta">
                      Last updated: {formatDate(value.updatedAt)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="actions-panel">
            <h2>Manual Actions</h2>
            <div className="action-buttons">
              <div className="action-group">
                <h3>Auto-Interact</h3>
                <p>Trigger automatic interactions with trending posts</p>
                <button 
                  onClick={() => triggerAction('auto-interact', { limit: 5 })}
                  className="action-btn"
                >
                  Run Auto-Interact
                </button>
              </div>
              
              <div className="action-group">
                <h3>Create Post</h3>
                <p>Manually trigger Carlbot to create an original post</p>
                <button 
                  onClick={() => triggerAction('create-post', {})}
                  className="action-btn"
                >
                  Create Post
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-panel">
            <h2>User Management</h2>
            <div className="user-search">
              <input
                type="text"
                placeholder="Search users by username, email, or display name..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value)
                  setTimeout(() => fetchUsers(), 500)
                }}
                className="search-input"
              />
            </div>
            <div className="users-list">
              {users.map((user) => (
                <div key={user.id} className="user-item">
                  <div className="user-info">
                    <div className="user-avatar">{user.avatar_url || '👤'}</div>
                    <div className="user-details">
                      <div className="user-name">{user.display_name || user.username}</div>
                      <div className="user-meta">
                        @{user.username} • {user.email || 'No email'}
                      </div>
                      <div className="user-stats">
                        {user.posts_count || 0} posts • {user.followers_count || 0} followers • Level {user.level || 1}
                      </div>
                    </div>
                  </div>
                  <div className="user-actions">
                    <button onClick={() => fetchUserDetails(user.id)} className="view-btn">
                      View Details
                    </button>
                    <button onClick={() => banUser(user.id)} className="ban-btn">
                      Ban
                    </button>
                    <button onClick={() => deleteUser(user.id)} className="delete-btn">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {selectedUser && (
              <div className="user-detail-modal">
                <div className="modal-content">
                  <h3>User Details: {selectedUser.display_name || selectedUser.username}</h3>
                  <div className="detail-grid">
                    <div><strong>ID:</strong> {selectedUser.id}</div>
                    <div><strong>Username:</strong> @{selectedUser.username}</div>
                    <div><strong>Email:</strong> {selectedUser.email || 'N/A'}</div>
                    <div><strong>Created:</strong> {formatDate(selectedUser.created_at)}</div>
                    <div><strong>Posts:</strong> {selectedUser.posts_count || 0}</div>
                    <div><strong>Comments:</strong> {selectedUser.comments_count || 0}</div>
                    <div><strong>Followers:</strong> {selectedUser.followers_count || 0}</div>
                    <div><strong>Following:</strong> {selectedUser.following_count || 0}</div>
                    <div><strong>Level:</strong> {selectedUser.level || 1}</div>
                    <div><strong>Points:</strong> {selectedUser.total_points || 0}</div>
                  </div>
                  {selectedUser.recentPosts && selectedUser.recentPosts.length > 0 && (
                    <div className="recent-posts">
                      <h4>Recent Posts</h4>
                      {selectedUser.recentPosts.map((post) => (
                        <div key={post.id} className="post-item">
                          <div className="post-content">{post.content.substring(0, 100)}...</div>
                          <div className="post-stats">
                            👍 {post.likes_count || 0} • 💬 {post.comments_count || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setSelectedUser(null)} className="close-btn">
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'moderation' && (
          <div className="moderation-panel">
            <h2>Content Moderation</h2>
            <div className="moderation-list">
              {moderationPosts.map((post) => (
                <div key={post.id} className="moderation-item">
                  <div className="post-header">
                    <span className="post-author">@{post.username}</span>
                    <span className="post-date">{formatDate(post.created_at)}</span>
                  </div>
                  <div className="post-content">{post.content}</div>
                  <div className="post-stats">
                    👍 {post.likes_count || 0} • 💬 {post.comments_count || 0}
                  </div>
                  <div className="moderation-actions">
                    <button onClick={() => navigate(`/post/${post.id}`)} className="view-btn">
                      View Post
                    </button>
                    <button onClick={() => deletePost(post.id)} className="delete-btn">
                      Delete Post
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="system-panel">
            <h2>System Health</h2>
            {systemHealth && (
              <>
                <div className="health-stats">
                  <div className="health-card">
                    <h3>Database Statistics</h3>
                    <div className="health-item">
                      <span>Total Users:</span>
                      <span>{systemHealth.database?.totalUsers || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>Total Posts:</span>
                      <span>{systemHealth.database?.totalPosts || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>Total Comments:</span>
                      <span>{systemHealth.database?.totalComments || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>Total Communities:</span>
                      <span>{systemHealth.database?.totalCommunities || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>Total Conversations:</span>
                      <span>{systemHealth.database?.totalConversations || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>Total Achievements:</span>
                      <span>{systemHealth.database?.totalAchievements || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>Database Size:</span>
                      <span>{formatBytes(systemHealth.dbSize || 0)}</span>
                    </div>
                  </div>
                  
                  <div className="health-card">
                    <h3>Recent Activity (Last 24h)</h3>
                    <div className="health-item">
                      <span>New Users:</span>
                      <span>{systemHealth.recentActivity?.newUsers || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>New Posts:</span>
                      <span>{systemHealth.recentActivity?.newPosts || 0}</span>
                    </div>
                    <div className="health-item">
                      <span>New Comments:</span>
                      <span>{systemHealth.recentActivity?.newComments || 0}</span>
                    </div>
                  </div>
                </div>
                
                {systemHealth.topUsers && systemHealth.topUsers.length > 0 && (
                  <div className="top-users-section">
                    <h3>Top Users</h3>
                    <div className="top-users-list">
                      {systemHealth.topUsers.map((user, index) => (
                        <div key={user.id} className="top-user-item">
                          <span className="rank">#{index + 1}</span>
                          <span className="username">@{user.username}</span>
                          <span className="stats">{user.posts} posts • {user.followers} followers</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="achievements-management-panel">
            <h2>Achievement Management</h2>
            <button 
              onClick={() => setEditingAchievement({})}
              className="create-btn"
            >
              + Create New Achievement
            </button>
            
            {editingAchievement && (
              <div className="achievement-editor">
                <h3>{editingAchievement.id ? 'Edit' : 'Create'} Achievement</h3>
                <div className="editor-form">
                  <input
                    type="text"
                    placeholder="Code (unique identifier)"
                    value={editingAchievement.code || ''}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, code: e.target.value })}
                    disabled={!!editingAchievement.id}
                  />
                  <input
                    type="text"
                    placeholder="Name"
                    value={editingAchievement.name || ''}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, name: e.target.value })}
                  />
                  <textarea
                    placeholder="Description"
                    value={editingAchievement.description || ''}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, description: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Icon (emoji)"
                    value={editingAchievement.icon || ''}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, icon: e.target.value })}
                  />
                  <select
                    value={editingAchievement.category || 'general'}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, category: e.target.value })}
                  >
                    <option value="general">General</option>
                    <option value="content">Content</option>
                    <option value="social">Social</option>
                    <option value="engagement">Engagement</option>
                    <option value="progression">Progression</option>
                  </select>
                  <select
                    value={editingAchievement.requirement_type || 'posts'}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, requirement_type: e.target.value })}
                  >
                    <option value="posts">Posts</option>
                    <option value="comments">Comments</option>
                    <option value="likes_received">Likes Received</option>
                    <option value="followers">Followers</option>
                    <option value="level">Level</option>
                    <option value="streak">Streak</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Requirement Value"
                    value={editingAchievement.requirement_value || ''}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, requirement_value: parseInt(e.target.value) })}
                  />
                  <input
                    type="number"
                    placeholder="Points"
                    value={editingAchievement.points || ''}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, points: parseInt(e.target.value) })}
                  />
                  <select
                    value={editingAchievement.rarity || 'common'}
                    onChange={(e) => setEditingAchievement({ ...editingAchievement, rarity: e.target.value })}
                  >
                    <option value="common">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                  <div className="editor-actions">
                    <button onClick={() => createAchievement(editingAchievement)} className="save-btn">
                      {editingAchievement.id ? 'Update' : 'Create'}
                    </button>
                    <button onClick={() => setEditingAchievement(null)} className="cancel-btn">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="achievements-list">
              {achievements.map((achievement) => (
                <div key={achievement.id} className="achievement-item">
                  <div className="achievement-icon">{achievement.icon || '🏆'}</div>
                  <div className="achievement-info">
                    <h4>{achievement.name}</h4>
                    <p>{achievement.description}</p>
                    <div className="achievement-meta">
                      {achievement.category} • {achievement.requirement_type}: {achievement.requirement_value} • {achievement.points} pts • {achievement.rarity}
                    </div>
                    <div className="achievement-stats">
                      Earned by {achievement.earned_count || 0} users
                    </div>
                  </div>
                  <div className="achievement-actions">
                    <button onClick={() => setEditingAchievement(achievement)} className="edit-btn">
                      Edit
                    </button>
                    <button onClick={() => deleteAchievement(achievement.id)} className="delete-btn">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-overview-panel">
            <h2>Platform Analytics</h2>
            {analyticsOverview && (
              <>
                {analyticsOverview.userGrowth && analyticsOverview.userGrowth.length > 0 && (
                  <div className="chart-section">
                    <h3>User Growth (Last 30 Days)</h3>
                    <div className="chart">
                      {analyticsOverview.userGrowth.map((item, index) => (
                        <div key={index} className="chart-bar-container">
                          <div 
                            className="chart-bar"
                            style={{ 
                              height: `${(item.new_users / Math.max(...analyticsOverview.userGrowth.map(i => i.new_users), 1)) * 100}%` 
                            }}
                            title={`${item.date}: ${item.new_users} users`}
                          />
                          <div className="chart-label">{new Date(item.date).getDate()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {analyticsOverview.postGrowth && analyticsOverview.postGrowth.length > 0 && (
                  <div className="chart-section">
                    <h3>Post Growth (Last 30 Days)</h3>
                    <div className="chart">
                      {analyticsOverview.postGrowth.map((item, index) => (
                        <div key={index} className="chart-bar-container">
                          <div 
                            className="chart-bar"
                            style={{ 
                              height: `${(item.new_posts / Math.max(...analyticsOverview.postGrowth.map(i => i.new_posts), 1)) * 100}%` 
                            }}
                            title={`${item.date}: ${item.new_posts} posts`}
                          />
                          <div className="chart-label">{new Date(item.date).getDate()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {analyticsOverview.topGames && analyticsOverview.topGames.length > 0 && (
                  <div className="top-games-section">
                    <h3>Top Games</h3>
                    <div className="top-games-list">
                      {analyticsOverview.topGames.map((game, index) => (
                        <div key={index} className="game-item">
                          <span className="game-icon">{game.icon || '🎮'}</span>
                          <span className="game-name">{game.name}</span>
                          <span className="game-count">{game.post_count} posts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'decisions' && (
          <div className="decisions-panel">
            <h2>🧠 AI Decision Logs</h2>
            <p className="panel-description">
              Detailed logs showing how Carlbot decides which posts to interact with
            </p>
            <div className="decisions-list">
              {decisionLogs.map((decision) => {
                const metadata = decision.parsedMetadata || {}
                const isDecision = decision.action_type.startsWith('decision_')
                const decisionType = decision.action_type.replace('decision_', '')
                
                return (
                  <div key={decision.id} className={`decision-item ${isDecision ? 'rejected' : 'accepted'}`}>
                    <div className="decision-header">
                      <span className="decision-type">
                        {isDecision ? '❌ DECIDED NOT TO' : '✅ DECIDED TO'} {decisionType.toUpperCase()}
                      </span>
                      <span className="decision-time">{formatDate(decision.created_at)}</span>
                    </div>
                    {metadata.postContent && (
                      <div className="decision-post">
                        <strong>Post:</strong> "{metadata.postContent}..."
                      </div>
                    )}
                    {metadata.author && (
                      <div className="decision-meta">
                        <span>Author: @{metadata.author}</span>
                        {metadata.game && <span>• Game: {metadata.game}</span>}
                        {metadata.engagement && (
                          <span>• Engagement: 👍 {metadata.engagement.likes} 💬 {metadata.engagement.comments}</span>
                        )}
                      </div>
                    )}
                    {metadata.aiResponse && (
                      <div className="decision-reasoning">
                        <strong>AI Reasoning:</strong> {metadata.aiResponse}
                      </div>
                    )}
                    {metadata.gameContext && (
                      <div className="decision-context">
                        <strong>Game Context:</strong> {metadata.gameContext === 'Detected' ? '✅ Detected' : 'None'}
                      </div>
                    )}
                    {metadata.learningContext && (
                      <div className="decision-context">
                        <strong>Learning Applied:</strong> {metadata.learningContext === 'Applied' ? '✅ Used past successful patterns' : 'None'}
                      </div>
                    )}
                    {metadata.generatedComment && (
                      <div className="decision-comment">
                        <strong>Generated Comment:</strong> "{metadata.generatedComment}"
                      </div>
                    )}
                    {metadata && Object.keys(metadata).length > 0 && (
                      <details className="decision-details">
                        <summary>View Full Metadata</summary>
                        <pre>{JSON.stringify(metadata, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
            {decisionLogs.length === 0 && (
              <div className="no-decisions">No decision logs found yet.</div>
            )}
          </div>
        )}

        {activeTab === 'query-builder' && (
          <div className="query-builder-panel">
            <h2>🔍 Visual SQL Query Builder</h2>
            <p className="panel-description">
              Build database queries visually - no SQL knowledge required!
            </p>
            
            {databaseSchema && (
              <div className="query-builder-form">
                <div className="query-section">
                  <h3>1. Select Table</h3>
                  <select
                    value={queryBuilder.table}
                    onChange={(e) => setQueryBuilder(prev => ({ ...prev, table: e.target.value, columns: [] }))}
                    className="query-select"
                  >
                    <option value="">-- Select Table --</option>
                    {databaseSchema.tables.map(table => (
                      <option key={table} value={table}>{table}</option>
                    ))}
                  </select>
                </div>

                {queryBuilder.table && databaseSchema.schema[queryBuilder.table] && (
                  <>
                    <div className="query-section">
                      <h3>2. Select Columns</h3>
                      <div className="columns-list">
                        {queryBuilder.columns.length === 0 ? (
                          <button onClick={addColumn} className="add-btn">+ Add Column</button>
                        ) : (
                          queryBuilder.columns.map((col, idx) => (
                            <div key={idx} className="column-item">
                              <select
                                value={col}
                                onChange={(e) => updateColumn(idx, e.target.value)}
                                className="query-select"
                              >
                                <option value="">-- Select Column --</option>
                                {databaseSchema.schema[queryBuilder.table].map(column => (
                                  <option key={column.name} value={column.name}>
                                    {column.name} ({column.type})
                                  </option>
                                ))}
                              </select>
                              <button onClick={() => removeColumn(idx)} className="remove-btn">×</button>
                            </div>
                          ))
                        )}
                        {queryBuilder.columns.length > 0 && (
                          <button onClick={addColumn} className="add-btn">+ Add More</button>
                        )}
                        {queryBuilder.columns.length === 0 && (
                          <p className="hint">Leave empty to select all columns</p>
                        )}
                      </div>
                    </div>

                    <div className="query-section">
                      <h3>3. Add Filters (Optional)</h3>
                      <div className="filters-list">
                        {queryBuilder.filters.map((filter, idx) => (
                          <div key={idx} className="filter-item">
                            <select
                              value={filter.column}
                              onChange={(e) => updateFilter(idx, 'column', e.target.value)}
                              className="query-select"
                            >
                              <option value="">-- Column --</option>
                              {databaseSchema.schema[queryBuilder.table].map(column => (
                                <option key={column.name} value={column.name}>
                                  {column.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={filter.operator}
                              onChange={(e) => updateFilter(idx, 'operator', e.target.value)}
                              className="query-select"
                            >
                              <option value="equals">Equals</option>
                              <option value="not_equals">Not Equals</option>
                              <option value="contains">Contains</option>
                              <option value="starts_with">Starts With</option>
                              <option value="ends_with">Ends With</option>
                              <option value="greater_than">Greater Than</option>
                              <option value="less_than">Less Than</option>
                              <option value="greater_equal">Greater or Equal</option>
                              <option value="less_equal">Less or Equal</option>
                              <option value="is_null">Is Null</option>
                              <option value="is_not_null">Is Not Null</option>
                            </select>
                            {!filter.operator.includes('null') && (
                              <input
                                type="text"
                                value={filter.value}
                                onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                                placeholder="Value"
                                className="query-input"
                              />
                            )}
                            <button onClick={() => removeFilter(idx)} className="remove-btn">×</button>
                          </div>
                        ))}
                        <button onClick={addFilter} className="add-btn">+ Add Filter</button>
                      </div>
                    </div>

                    <div className="query-section">
                      <h3>4. Sort Results (Optional)</h3>
                      <div className="sort-controls">
                        <select
                          value={queryBuilder.orderBy.column}
                          onChange={(e) => setQueryBuilder(prev => ({
                            ...prev,
                            orderBy: { ...prev.orderBy, column: e.target.value }
                          }))}
                          className="query-select"
                        >
                          <option value="">-- No Sorting --</option>
                          {databaseSchema.schema[queryBuilder.table].map(column => (
                            <option key={column.name} value={column.name}>
                              {column.name}
                            </option>
                          ))}
                        </select>
                        {queryBuilder.orderBy.column && (
                          <select
                            value={queryBuilder.orderBy.direction}
                            onChange={(e) => setQueryBuilder(prev => ({
                              ...prev,
                              orderBy: { ...prev.orderBy, direction: e.target.value }
                            }))}
                            className="query-select"
                          >
                            <option value="ASC">Ascending</option>
                            <option value="DESC">Descending</option>
                          </select>
                        )}
                      </div>
                    </div>

                    <div className="query-section">
                      <h3>5. Limit Results</h3>
                      <input
                        type="number"
                        value={queryBuilder.limit}
                        onChange={(e) => setQueryBuilder(prev => ({
                          ...prev,
                          limit: parseInt(e.target.value) || 100
                        }))}
                        min="1"
                        max="1000"
                        className="query-input"
                      />
                      <p className="hint">Max 1000 rows</p>
                    </div>

                    <button onClick={executeQuery} className="execute-query-btn">
                      🚀 Execute Query
                    </button>
                  </>
                )}
              </div>
            )}

            {queryError && (
              <div className="query-error">
                <strong>Error:</strong> {queryError}
              </div>
            )}

            {queryResults && (
              <div className="query-results">
                <h3>Results ({queryResults.count} rows)</h3>
                {queryResults.query && (
                  <div className="generated-query">
                    <strong>Generated SQL:</strong>
                    <pre>{queryResults.query}</pre>
                  </div>
                )}
                <div className="results-table-container">
                  <table className="results-table">
                    <thead>
                      <tr>
                        {queryResults.results.length > 0 && Object.keys(queryResults.results[0]).map(key => (
                          <th key={key}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResults.results.map((row, idx) => (
                        <tr key={idx}>
                          {Object.values(row).map((val, i) => (
                            <td key={i}>
                              {typeof val === 'object' ? JSON.stringify(val) : String(val || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'features' && (
          <div className="features-panel">
            <div className="features-header">
              <div>
                <h2>⚡ Feature Management</h2>
                <p className="panel-description">
                  Enable or disable app features dynamically. Control what users can access!
                </p>
              </div>
              <button 
                onClick={() => setEditingFeature({})}
                className="create-feature-btn"
              >
                + Create New Feature
              </button>
            </div>

            {editingFeature && (
              <div className="feature-editor">
                <h3>{editingFeature.feature_key ? 'Edit' : 'Create'} Feature</h3>
                <div className="editor-form">
                  <input
                    type="text"
                    placeholder="Feature Key (e.g., 'dark_mode')"
                    value={editingFeature.feature_key || ''}
                    onChange={(e) => setEditingFeature({ ...editingFeature, feature_key: e.target.value })}
                    disabled={!!editingFeature.feature_key}
                    className="feature-input"
                  />
                  <input
                    type="text"
                    placeholder="Feature Name (e.g., 'Dark Mode')"
                    value={editingFeature.feature_name || ''}
                    onChange={(e) => setEditingFeature({ ...editingFeature, feature_name: e.target.value })}
                    className="feature-input"
                  />
                  <textarea
                    placeholder="Description"
                    value={editingFeature.description || ''}
                    onChange={(e) => setEditingFeature({ ...editingFeature, description: e.target.value })}
                    className="feature-textarea"
                  />
                  <label className="feature-toggle-label">
                    <input
                      type="checkbox"
                      checked={editingFeature.is_enabled || false}
                      onChange={(e) => setEditingFeature({ ...editingFeature, is_enabled: e.target.checked })}
                    />
                    Enabled by default
                  </label>
                  <div className="editor-actions">
                    <button onClick={() => createFeature(editingFeature)} className="save-btn">
                      {editingFeature.feature_key ? 'Update' : 'Create'}
                    </button>
                    <button onClick={() => setEditingFeature(null)} className="cancel-btn">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="features-grid">
              {features.map((feature) => (
                <div key={feature.id} className={`feature-card ${feature.is_enabled ? 'enabled' : 'disabled'}`}>
                  <div className="feature-header">
                    <h3>{feature.feature_name}</h3>
                    <label className="feature-switch">
                      <input
                        type="checkbox"
                        checked={feature.is_enabled}
                        onChange={() => toggleFeature(feature.feature_key, feature.is_enabled)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                  <p className="feature-description">{feature.description || 'No description'}</p>
                  <div className="feature-meta">
                    <span className="feature-key">Key: {feature.feature_key}</span>
                    <span className="feature-status">
                      {feature.is_enabled ? '🟢 Enabled' : '⚪ Disabled'}
                    </span>
                  </div>
                  <div className="feature-actions">
                    <button 
                      onClick={() => setEditingFeature(feature)}
                      className="edit-feature-btn"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => deleteFeature(feature.feature_key)}
                      className="delete-feature-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'moderation-logs' && (
          <div className="moderation-logs-panel">
            <div className="moderation-header">
              <div>
                <h2>🛡️ Moderation Logs</h2>
                <p className="panel-description">
                  Complete logs of all content moderation actions, banned users, and deleted content
                </p>
              </div>
              <div className="moderation-actions">
                <button 
                  className="mod-check-btn"
                  onClick={handleManualModerationCheck}
                  title="Check recent content for moderation"
                >
                  🔍 Check Recent Content
                </button>
                <button 
                  className="mod-check-btn"
                  onClick={() => {
                    setInputPrompt({
                      isOpen: true,
                      message: 'Enter Post ID to check:',
                      placeholder: 'Post ID',
                      onConfirm: (value) => {
                        if (value && !isNaN(value)) {
                          handleCheckSpecificPost(parseInt(value))
                        } else {
                          showAlert('Please enter a valid Post ID', 'error')
                        }
                        setInputPrompt({ isOpen: false, message: '', placeholder: '', onConfirm: null })
                      }
                    })
                  }}
                  title="Check specific post"
                >
                  📝 Check Post
                </button>
                <button 
                  className="mod-check-btn"
                  onClick={() => {
                    setInputPrompt({
                      isOpen: true,
                      message: 'Enter Comment ID to check:',
                      placeholder: 'Comment ID',
                      onConfirm: (value) => {
                        if (value && !isNaN(value)) {
                          handleCheckSpecificComment(parseInt(value))
                        } else {
                          showAlert('Please enter a valid Comment ID', 'error')
                        }
                        setInputPrompt({ isOpen: false, message: '', placeholder: '', onConfirm: null })
                      }
                    })
                  }}
                  title="Check specific comment"
                >
                  💬 Check Comment
                </button>
              </div>
            </div>

            {moderationStats && (
              <div className="moderation-stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{moderationStats.totalBanned}</div>
                  <div className="stat-label">Total Banned Users</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{moderationStats.totalDeletedPosts}</div>
                  <div className="stat-label">Deleted Posts</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{moderationStats.totalDeletedComments}</div>
                  <div className="stat-label">Deleted Comments</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{moderationStats.moderationActions24h}</div>
                  <div className="stat-label">Actions (24h)</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{moderationStats.moderationActions7d}</div>
                  <div className="stat-label">Actions (7 days)</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{moderationStats.bannedToday}</div>
                  <div className="stat-label">Banned Today</div>
                </div>
              </div>
            )}

            <div className="moderation-tabs">
              <button className="mod-tab active">Moderation Actions</button>
              <button className="mod-tab">Banned Users</button>
              <button className="mod-tab">Deleted Content</button>
            </div>

            <div className="moderation-content">
              <div className="moderation-actions-section">
                <h3>Recent Moderation Actions</h3>
                <div className="moderation-logs-list">
                  {moderationLogs.map((log) => {
                    const metadata = log.parsedMetadata || {}
                    return (
                      <div key={log.id} className="moderation-log-item">
                        <div className="log-header">
                          <span className="log-action">🛡️ {log.action_type.replace('moderation_', '').toUpperCase()}</span>
                          <span className="log-time">{formatDate(log.created_at)}</span>
                        </div>
                        <div className="log-details">
                          <div className="log-description">{log.action_details}</div>
                          {metadata.userId && (
                            <div className="log-meta">
                              <span>User ID: {metadata.userId}</span>
                              {metadata.postId && <span>• Post ID: {metadata.postId}</span>}
                              {metadata.commentId && <span>• Comment ID: {metadata.commentId}</span>}
                            </div>
                          )}
                          {metadata.reason && (
                            <div className="log-reason">
                              <strong>Reason:</strong> {metadata.reason}
                            </div>
                          )}
                          {metadata.severity && (
                            <div className="log-severity">
                              <strong>Severity:</strong> <span className={`severity-badge ${metadata.severity}`}>{metadata.severity}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {moderationLogs.length === 0 && (
                  <div className="no-logs">No moderation actions logged yet.</div>
                )}
              </div>

              <div className="banned-users-section">
                <h3>Banned Users ({bannedUsers.length})</h3>
                <div className="banned-users-list">
                  {bannedUsers.map((user) => (
                    <div key={user.id} className="banned-user-item">
                      <div className="user-info">
                        <span className="username">@{user.username}</span>
                        {user.email && <span className="email">{user.email}</span>}
                      </div>
                      <div className="user-stats">
                        <span>{user.deleted_posts || 0} deleted posts</span>
                        <span>•</span>
                        <span>{user.deleted_comments || 0} deleted comments</span>
                      </div>
                      <div className="user-dates">
                        <span>Joined: {formatDate(user.created_at)}</span>
                        {user.banned_at && <span>• Banned: {formatDate(user.banned_at)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {bannedUsers.length === 0 && (
                  <div className="no-logs">No banned users.</div>
                )}
              </div>

              <div className="deleted-content-section">
                <h3>Deleted Content</h3>
                <div className="deleted-posts-section">
                  <h4>Deleted Posts ({deletedContent.posts?.length || 0})</h4>
                  <div className="deleted-content-list">
                    {deletedContent.posts?.map((post) => (
                      <div key={post.id} className="deleted-item">
                        <div className="deleted-header">
                          <span className="deleted-author">@{post.author_username}</span>
                          <span className="deleted-time">{formatDate(post.updated_at)}</span>
                        </div>
                        <div className="deleted-content-text">
                          {post.content === '[deleted by carlbot]' ? (
                            <span className="deleted-marker">[deleted by carlbot]</span>
                          ) : (
                            post.content
                          )}
                        </div>
                        {post.deleted_reason && (
                          <div className="deleted-reason">
                            <strong>Reason:</strong> {post.deleted_reason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="deleted-comments-section">
                  <h4>Deleted Comments ({deletedContent.comments?.length || 0})</h4>
                  <div className="deleted-content-list">
                    {deletedContent.comments?.map((comment) => (
                      <div key={comment.id} className="deleted-item">
                        <div className="deleted-header">
                          <span className="deleted-author">@{comment.author_username}</span>
                          <span className="deleted-time">{formatDate(comment.created_at)}</span>
                        </div>
                        <div className="deleted-content-text">
                          {comment.comment === '[deleted by carlbot]' ? (
                            <span className="deleted-marker">[deleted by carlbot]</span>
                          ) : (
                            comment.comment
                          )}
                        </div>
                        {comment.deleted_reason && (
                          <div className="deleted-reason">
                            <strong>Reason:</strong> {comment.deleted_reason}
                          </div>
                        )}
                        {comment.post_content && (
                          <div className="deleted-context">
                            <strong>On post:</strong> "{comment.post_content.substring(0, 100)}..."
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {(!deletedContent.posts || deletedContent.posts.length === 0) && 
                 (!deletedContent.comments || deletedContent.comments.length === 0) && (
                  <div className="no-logs">No deleted content.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <CustomAlert
        isOpen={customAlert.isOpen}
        message={customAlert.message}
        type={customAlert.type}
        title={customAlert.title}
        onClose={hideAlert}
        onConfirm={customAlert.onConfirm}
        onCancel={customAlert.onCancel}
      />
      
      <InputPrompt
        isOpen={inputPrompt.isOpen}
        message={inputPrompt.message}
        placeholder={inputPrompt.placeholder}
        onConfirm={inputPrompt.onConfirm}
        onCancel={() => setInputPrompt({ isOpen: false, message: '', placeholder: '', onConfirm: null })}
      />
    </div>
  )
}

export default AdminPanel
