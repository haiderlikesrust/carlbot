import { useState, useEffect } from 'react'
import { loadConversationHistory } from '../utils/storage'
import './RecentConversations.css'

function RecentConversations({ onClose, onSelectConversation, currentHistory }) {
  const [conversations, setConversations] = useState([])

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = () => {
    // Load from localStorage - you might want to enhance this
    const saved = localStorage.getItem('carl_conversations')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setConversations(parsed.slice(0, 10)) // Last 10 conversations
      } catch (e) {
        console.error('Failed to load conversations:', e)
      }
    }
  }

  const handleSelect = (conversation) => {
    if (onSelectConversation) {
      onSelectConversation(conversation)
    }
  }

  const getPreview = (history) => {
    if (!history || history.length === 0) return 'Empty conversation'
    const lastMessage = history[history.length - 1]
    if (lastMessage && lastMessage.content) {
      return lastMessage.content.substring(0, 50) + '...'
    }
    return 'No preview'
  }

  return (
    <div className="recent-conversations-sidebar">
      <div className="sidebar-header">
        <h3>💬 Recent Conversations</h3>
        <button className="close-sidebar-btn" onClick={onClose}>×</button>
      </div>
      <div className="conversations-list">
        {conversations.length === 0 ? (
          <div className="empty-conversations">
            <p>No recent conversations</p>
            <p className="hint">Start chatting to see your history here</p>
          </div>
        ) : (
          conversations.map((conv, idx) => (
            <div
              key={idx}
              className="conversation-item"
              onClick={() => handleSelect(conv)}
            >
              <div className="conversation-preview">
                {getPreview(conv)}
              </div>
              <div className="conversation-meta">
                {conv.length} messages
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default RecentConversations
