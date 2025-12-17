import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import './Notifications.css'

function Notifications() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const apiBase = 'http://localhost:3000/api'

  useEffect(() => {
    if (user && token) {
      fetchNotifications()
      fetchUnreadCount()

      // Connect to socket.io for real-time notifications
      const socket = io('http://localhost:3000', {
        transports: ['websocket']
      })

      // Authenticate socket connection
      socket.emit('authenticate', token)

      // Listen for new notifications
      socket.on('notification', (notification) => {
        setNotifications(prev => [notification, ...prev])
        setUnreadCount(prev => prev + 1)
      })

      // Cleanup
      return () => {
        socket.disconnect()
      }
    }
  }, [user, token])

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('carl_token')
      const response = await fetch(`${apiBase}/notifications`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setNotifications(data)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('carl_token')
      const response = await fetch(`${apiBase}/notifications/unread`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.count || 0)
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error)
    }
  }

  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem('carl_token')
      await fetch(`${apiBase}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      fetchNotifications()
      fetchUnreadCount()
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('carl_token')
      await fetch(`${apiBase}/notifications/read-all`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      fetchNotifications()
      fetchUnreadCount()
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    
    if (notification.post_id) {
      navigate(`/social?post=${notification.post_id}`)
    } else if (notification.message_id) {
      navigate(`/messages`)
    }
    setIsOpen(false)
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'like': return '👍'
      case 'comment': return '💬'
      case 'follow': return '👤'
      case 'mention': return '📢'
      case 'dm': return '✉️'
      case 'reply': return '↩️'
      default: return '🔔'
    }
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

  if (!user) return null

  return (
    <div className="notifications-container">
      <button 
        className="notifications-btn" 
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="notifications-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      
      {isOpen && (
        <div className="notifications-dropdown">
          <div className="notifications-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="mark-all-read-btn">
                Mark all read
              </button>
            )}
          </div>
          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">No notifications yet</div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-text">
                      {notification.actor_username && (
                        <strong>@{notification.actor_username}</strong>
                      )}
                      {' '}
                      {notification.content || 
                        (notification.type === 'like' && 'liked your post') ||
                        (notification.type === 'comment' && 'commented on your post') ||
                        (notification.type === 'follow' && 'started following you') ||
                        (notification.type === 'reply' && 'replied to your comment') ||
                        (notification.type === 'dm' && 'sent you a message')}
                    </div>
                    <div className="notification-time">
                      {formatTime(notification.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Notifications

