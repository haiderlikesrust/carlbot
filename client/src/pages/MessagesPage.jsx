import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import Alert from '../components/Alert'
import './MessagesPage.css'

const API_BASE = 'http://localhost:3000/api'

function MessagesPage() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { alert, showAlert, hideAlert, showLoginAlert } = useAlert()
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      showLoginAlert('viewing messages')
      navigate('/')
      return
    }
    fetchConversations()
  }, [user])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.other_user_id)
    }
  }, [selectedConversation])

  const fetchConversations = async () => {
    try {
      const response = await fetch(`${API_BASE}/messages/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setConversations(data)
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (userId) => {
    try {
      const response = await fetch(`${API_BASE}/messages/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation) return

    try {
      const response = await fetch(`${API_BASE}/messages/${selectedConversation.other_user_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: newMessage })
      })

      if (response.ok) {
        const message = await response.json()
        setMessages([...messages, message])
        setNewMessage('')
        fetchConversations() // Refresh to update last message
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      showAlert('Failed to send message', 'error')
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

  if (loading) {
    return <div className="loading">Loading messages...</div>
  }

  return (
    <div className="messages-page">
      <header className="messages-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Back
        </button>
        <h1>💬 Messages</h1>
      </header>

      <div className="messages-container">
        <div className="conversations-sidebar">
          <h2>Conversations</h2>
          {conversations.length === 0 ? (
            <div className="no-conversations">No conversations yet</div>
          ) : (
            <div className="conversations-list">
              {conversations.map(conv => (
                <div
                  key={conv.other_user_id}
                  className={`conversation-item ${selectedConversation?.other_user_id === conv.other_user_id ? 'active' : ''}`}
                  onClick={() => setSelectedConversation(conv)}
                >
                  {conv.other_avatar_url ? (
                    <img src={conv.other_avatar_url} alt={conv.other_username} className="conversation-avatar" />
                  ) : (
                    <div className="conversation-avatar placeholder">👤</div>
                  )}
                  <div className="conversation-info">
                    <div className="conversation-username">@{conv.other_username}</div>
                    <div className="conversation-preview">{conv.last_message?.substring(0, 50)}...</div>
                    <div className="conversation-meta">
                      <span>{formatTime(conv.last_message_at)}</span>
                      {conv.unread_count > 0 && (
                        <span className="unread-badge">{conv.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="messages-main">
          {selectedConversation ? (
            <>
              <div className="messages-header-bar">
                <div className="conversation-header">
                  {selectedConversation.other_avatar_url ? (
                    <img 
                      src={selectedConversation.other_avatar_url.startsWith('http') ? selectedConversation.other_avatar_url : `http://localhost:3000${selectedConversation.other_avatar_url}`} 
                      alt={selectedConversation.other_username} 
                      className="header-avatar"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        const placeholder = e.target.nextSibling
                        if (placeholder && placeholder.classList.contains('header-avatar')) {
                          placeholder.style.display = 'block'
                        }
                      }}
                      onClick={() => navigate(`/user/${selectedConversation.other_username}`)}
                    />
                  ) : (
                    <div 
                      className="header-avatar placeholder"
                      onClick={() => navigate(`/user/${selectedConversation.other_username}`)}
                    >
                      👤
                    </div>
                  )}
                  <h3 onClick={() => navigate(`/user/${selectedConversation.other_username}`)}>
                    @{selectedConversation.other_username}
                  </h3>
                </div>
              </div>

              <div className="messages-list">
                {messages.length === 0 ? (
                  <div className="no-messages">No messages yet. Start the conversation!</div>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`message-bubble ${msg.sender_id === user.id ? 'sent' : 'received'}`}
                    >
                      <div className="message-content">{msg.content}</div>
                      <div className="message-time">{formatTime(msg.created_at)}</div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendMessage} className="message-input-form">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="message-input"
                />
                <button type="submit" className="send-btn">Send</button>
              </form>
            </>
          ) : (
            <div className="no-selection">Select a conversation to start messaging</div>
          )}
        </div>
      </div>

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

export default MessagesPage

