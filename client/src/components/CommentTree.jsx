import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import './CommentTree.css'

const API_BASE = 'http://localhost:3000/api'

function CommentTree({ comments, postAuthorId, postId, onCommentAdded }) {
  const { user, token } = useAuth()
  const { showLoginAlert } = useAlert()
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState({})

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

  const handleReply = async (commentId, parentCommentId = null) => {
    if (!token) {
      showLoginAlert('replying to comments')
      return
    }

    const text = replyText[commentId] || ''
    if (!text.trim()) return

    try {
      const response = await fetch(`${API_BASE}/social/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          comment: text,
          parent_comment_id: parentCommentId || commentId
        })
      })

      if (response.ok) {
        setReplyText(prev => ({ ...prev, [commentId]: '' }))
        setReplyingTo(null)
        if (onCommentAdded) {
          onCommentAdded()
        }
      }
    } catch (error) {
      console.error('Failed to add reply:', error)
    }
  }

  const handleLike = async (commentId) => {
    if (!token) {
      showLoginAlert('liking comments')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/social/comments/${commentId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        if (onCommentAdded) {
          onCommentAdded()
        }
      }
    } catch (error) {
      console.error('Failed to like comment:', error)
    }
  }

  const CommentItem = ({ comment, depth = 0 }) => {
    const isOP = comment.is_op === 1
    const isLiked = comment.is_liked === 1

    return (
      <div className={`comment-item ${depth > 0 ? 'comment-reply' : ''}`} style={{ marginLeft: `${depth * 20}px` }}>
        <div className="comment-header">
          <div className="comment-author-info">
            {comment.avatar_url ? (
              <img 
                src={comment.avatar_url.startsWith('http') ? comment.avatar_url : `http://localhost:3000${comment.avatar_url}`} 
                alt={comment.username} 
                className="comment-avatar"
                onError={(e) => {
                  e.target.style.display = 'none'
                  const placeholder = e.target.nextSibling
                  if (placeholder && placeholder.classList.contains('comment-avatar-placeholder')) {
                    placeholder.style.display = 'block'
                  }
                }}
              />
            ) : (
              <div className="comment-avatar-placeholder">👤</div>
            )}
            <div className="comment-meta">
              <span className="comment-username">
                {comment.username}
                {isOP && <span className="op-badge">OP</span>}
              </span>
              <span className="comment-time">{formatTime(comment.created_at)}</span>
            </div>
          </div>
        </div>
        
        <div className="comment-body">
          <div className="comment-text">{comment.comment}</div>
          
          <div className="comment-actions">
            <button 
              className={`comment-action-btn ${isLiked ? 'liked' : ''}`}
              onClick={() => handleLike(comment.id)}
              disabled={!token}
              title="Like"
            >
              ▲ {comment.likes_count || 0}
            </button>
            <button 
              className="comment-action-btn"
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              disabled={!token}
              title="Reply"
            >
              Reply
            </button>
          </div>

          {replyingTo === comment.id && (
            <div className="comment-reply-form">
              <textarea
                value={replyText[comment.id] || ''}
                onChange={(e) => setReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
                placeholder="Write a reply..."
                rows={3}
                className="reply-textarea"
              />
              <div className="reply-actions">
                <button 
                  onClick={() => {
                    setReplyingTo(null)
                    setReplyText(prev => ({ ...prev, [comment.id]: '' }))
                  }}
                  className="reply-cancel-btn"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleReply(comment.id, comment.parent_comment_id || comment.id)}
                  className="reply-submit-btn"
                >
                  Reply
                </button>
              </div>
            </div>
          )}

          {comment.replies && comment.replies.length > 0 && (
            <div className="comment-replies">
              {comment.replies.map(reply => (
                <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!comments || comments.length === 0) {
    return (
      <div className="no-comments">
        No comments yet. Be the first to comment!
      </div>
    )
  }

  return (
    <div className="comment-tree">
      {comments.map(comment => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  )
}

export default CommentTree

