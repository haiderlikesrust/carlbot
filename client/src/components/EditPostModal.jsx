import { useState, useEffect } from 'react'
import './EditPostModal.css'

const API_BASE = 'http://localhost:3000/api'

function EditPostModal({ post, isOpen, onClose, onSuccess }) {
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (post && isOpen) {
      setContent(post.content || '')
      setTitle(post.title || '')
    }
  }, [post, isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!content.trim()) {
      setError('Content is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('carl_token')
      const response = await fetch(`${API_BASE}/social/${post.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content, title })
      })

      if (response.ok) {
        const updatedPost = await response.json()
        onSuccess(updatedPost)
        onClose()
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to update post')
      }
    } catch (error) {
      console.error('Edit post error:', error)
      setError('Failed to update post')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="edit-post-overlay" onClick={onClose}>
      <div className="edit-post-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-post-header">
          <h2>Edit Post</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="edit-post-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label>Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title..."
              className="edit-input"
            />
          </div>

          <div className="form-group">
            <label>Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="edit-textarea"
              rows={8}
              required
            />
            <div className="char-count">{content.length} characters</div>
          </div>

          <div className="edit-post-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="save-btn">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditPostModal
