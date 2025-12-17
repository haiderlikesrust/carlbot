import { useState, useEffect } from 'react'
import './EditHistoryModal.css'

const API_BASE = 'http://localhost:3000/api'

function EditHistoryModal({ postId, isOpen, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (postId && isOpen) {
      fetchHistory()
    }
  }, [postId, isOpen])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/social/${postId}/edit-history`)
      if (response.ok) {
        const data = await response.json()
        setHistory(data.history || [])
      }
    } catch (error) {
      console.error('Failed to fetch edit history:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  if (!isOpen) return null

  return (
    <div className="edit-history-overlay" onClick={onClose}>
      <div className="edit-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-history-header">
          <h2>Edit History</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="edit-history-content">
          {loading ? (
            <div className="loading">Loading edit history...</div>
          ) : history.length === 0 ? (
            <div className="no-history">No edit history available</div>
          ) : (
            <div className="history-list">
              {history.map((item, index) => (
                <div key={item.id} className="history-item">
                  <div className="history-header">
                    <span className="history-version">Version {history.length - index}</span>
                    <span className="history-date">{formatDate(item.edited_at)}</span>
                  </div>
                  <div className="history-content">{item.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EditHistoryModal
