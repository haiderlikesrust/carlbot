import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import Alert from '../components/Alert'
import CommentTree from '../components/CommentTree'
import EditPostModal from '../components/EditPostModal'
import EditHistoryModal from '../components/EditHistoryModal'
import LoadingScreen from '../components/LoadingScreen'
import './PostPage.css'

const API_BASE = 'http://localhost:3000/api'

function PostPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { alert, showAlert, hideAlert, showLoginAlert } = useAlert()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isLiking, setIsLiking] = useState(false)
  const [isRetweeting, setIsRetweeting] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [editingPost, setEditingPost] = useState(null)
  const [viewingHistory, setViewingHistory] = useState(null)

  useEffect(() => {
    fetchPost()
    fetchComments()
  }, [postId])

  const fetchPost = async () => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch(`${API_BASE}/social/post/${postId}`, { headers })
      if (response.ok) {
        const data = await response.json()
        setPost(data)
      } else {
        showAlert('Post not found', 'error')
        navigate('/social')
      }
    } catch (error) {
      console.error('Failed to fetch post:', error)
      showAlert('Failed to load post', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchComments = async () => {
    try {
      const response = await fetch(`${API_BASE}/social/${postId}/comments`)
      if (response.ok) {
        const data = await response.json()
        setComments(data)
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    }
  }

  const handleLike = async () => {
    if (!user) {
      showLoginAlert('liking posts')
      return
    }

    setIsLiking(true)
    try {
      const response = await fetch(`${API_BASE}/social/${postId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setPost(prev => ({
          ...prev,
          is_liked: data.is_liked,
          likes_count: data.likes_count
        }))
      }
    } catch (error) {
      console.error('Failed to like post:', error)
    } finally {
      setIsLiking(false)
    }
  }

  const handleRetweet = async () => {
    if (!user) {
      showLoginAlert('retweeting posts')
      return
    }

    setIsRetweeting(true)
    try {
      const response = await fetch(`${API_BASE}/social/${postId}/retweet`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setPost(prev => ({
          ...prev,
          is_retweeted: data.is_retweeted,
          retweets_count: data.retweets_count
        }))
      }
    } catch (error) {
      console.error('Failed to retweet post:', error)
    } finally {
      setIsRetweeting(false)
    }
  }

  const handleShare = async () => {
    if (!user) {
      showLoginAlert('sharing posts')
      return
    }

    setIsSharing(true)
    try {
      const response = await fetch(`${API_BASE}/social/${postId}/share`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setPost(prev => ({
          ...prev,
          is_shared: data.is_shared,
          shares_count: data.shares_count
        }))
        showAlert('Post shared!', 'success')
      }
    } catch (error) {
      console.error('Failed to share post:', error)
    } finally {
      setIsSharing(false)
    }
  }

  const handleComment = async (e) => {
    e.preventDefault()
    if (!user) {
      showLoginAlert('commenting')
      return
    }

    if (!newComment.trim()) return

    try {
      const response = await fetch(`${API_BASE}/social/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ comment: newComment })
      })

      if (response.ok) {
        setNewComment('')
        fetchComments()
        setPost(prev => ({
          ...prev,
          comments_count: (prev.comments_count || 0) + 1
        }))
      }
    } catch (error) {
      console.error('Failed to add comment:', error)
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

  const formatLinks = (text) => {
    if (!text) return ''
    // First format mentions, then format links
    let formatted = text.replace(/@(\w+)/g, '<a href="/user/$1" class="mention-link">@$1</a>')
    const urlRegex = /(https?:\/\/[^\s]+)/g
    return formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
  }

  if (loading) {
    return <LoadingScreen message="Loading post..." />
  }

  if (!post) {
    return null
  }

  return (
    <div className="post-page">
      <header className="post-header">
        <button 
          className="back-btn" 
          onClick={() => {
            // Smart back navigation - go to community if post is from one
            if (post.community_slug) {
              navigate(`/communities/${post.community_slug}`)
            } else {
              navigate('/social')
            }
          }}
        >
          ← Back {post.community_name ? `to ${post.community_name}` : 'to Feed'}
        </button>
        {post.community_name && (
          <button 
            className="community-nav-btn"
            onClick={() => navigate(`/communities/${post.community_slug}`)}
          >
            {post.community_icon} View {post.community_name} Community
          </button>
        )}
      </header>

      <div className="post-container">
        <div className="post-card-full">
          <div className="post-author-section">
            {post.avatar_url ? (
              <img 
                src={post.avatar_url.startsWith('http') ? post.avatar_url : `http://localhost:3000${post.avatar_url}`}
                onError={(e) => {
                  e.target.style.display = 'none'
                  const placeholder = e.target.nextSibling
                  if (placeholder && placeholder.classList.contains('post-avatar-large')) {
                    placeholder.style.display = 'block'
                  }
                }}
                alt={post.username} 
                className="post-avatar-large"
                onClick={() => navigate(`/user/${post.username}`)}
              />
            ) : (
              <div 
                className="post-avatar-large placeholder"
                onClick={() => navigate(`/user/${post.username}`)}
              >
                👤
              </div>
            )}
            <div className="post-author-info">
              <h3 onClick={() => navigate(`/user/${post.username}`)}>
                @{post.username}
              </h3>
              <div className="post-time-section">
                <span className="post-time">
                  {formatTime(post.created_at)}
                  {post.edited_at && (
                    <span 
                      className="edited-badge" 
                      title={`Edited ${formatTime(post.edited_at)}`}
                      onClick={() => setViewingHistory(post.id)}
                    >
                      (edited)
                    </span>
                  )}
                </span>
                {user && post.user_id === user.id && (
                  <div className="post-owner-actions">
                    <button
                      className="edit-post-btn"
                      onClick={() => setEditingPost(post)}
                      title="Edit post"
                    >
                      ✏️ Edit
                    </button>
                    {post.edited_at && (
                      <button
                        className="view-history-btn"
                        onClick={() => setViewingHistory(post.id)}
                        title="View edit history"
                      >
                        📜 History
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {post.community_name && (
            <div className="post-community-badge">
              <span 
                className="community-link"
                onClick={() => navigate(`/communities/${post.community_slug}`)}
                title={`View ${post.community_name} community`}
              >
                {post.community_icon} Posted in {post.community_name} →
              </span>
            </div>
          )}

          {post.game_name && (
            <div className="post-game-badge">
              {post.game_icon} {post.game_name}
            </div>
          )}

          {(post.carlbot_liked > 0 || post.carlbot_commented > 0 || post.carlbot_retweeted > 0) && (
            <div className="carlbot-interaction-badge">
              <span 
                onClick={() => navigate('/carlbot')}
                className="carlbot-link"
              >
                🤖 Interacted by Carlbot
              </span>
            </div>
          )}

          {post.title && (
            <h2 className="post-title">{post.title}</h2>
          )}

          <div 
            className="post-content-full"
            dangerouslySetInnerHTML={{ __html: formatLinks(post.content) }}
          />

          {post.image_url && (
            <img 
              src={`http://localhost:3000${post.image_url}`} 
              alt="Post" 
              className="post-image-full" 
            />
          )}

          {post.link_url && (
            <div className="post-link-preview">
              <a href={post.link_url} target="_blank" rel="noopener noreferrer">
                🔗 {post.link_url}
              </a>
            </div>
          )}

          <div className="post-actions-full">
            <button 
              className={`action-btn ${post.is_liked ? 'active' : ''}`}
              onClick={handleLike}
              disabled={isLiking}
            >
              👍 {post.likes_count || 0}
            </button>
            <button className="action-btn" disabled>
              💬 {post.comments_count || 0}
            </button>
            <button 
              className={`action-btn ${post.is_retweeted ? 'active' : ''}`}
              onClick={handleRetweet}
              disabled={isRetweeting}
            >
              🔄 {post.retweets_count || 0}
            </button>
            <button 
              className={`action-btn ${post.is_shared ? 'active' : ''}`}
              onClick={handleShare}
              disabled={isSharing}
            >
              📤 {post.shares_count || 0}
            </button>
          </div>
        </div>

        <div className="comments-section-full">
          <h3>Comments ({post.comments_count || 0})</h3>
          
          {user && (
            <form onSubmit={handleComment} className="comment-form">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                rows={3}
                className="comment-input"
              />
              <button type="submit" className="comment-submit-btn">
                Comment
              </button>
            </form>
          )}

          <div className="comments-list">
            {comments.length === 0 ? (
              <div className="no-comments">No comments yet. Be the first to comment!</div>
            ) : (
              <CommentTree 
                postId={postId}
                comments={comments}
                postAuthorId={post.user_id}
                onCommentAdded={fetchComments}
              />
            )}
          </div>
        </div>
      </div>

      {alert && <Alert message={alert.message} type={alert.type} onClose={hideAlert} />}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          isOpen={!!editingPost}
          onClose={() => setEditingPost(null)}
          onSuccess={(updatedPost) => {
            setPost(updatedPost)
            showAlert('Post updated successfully!', 'success')
          }}
        />
      )}

      {viewingHistory && (
        <EditHistoryModal
          postId={viewingHistory}
          isOpen={!!viewingHistory}
          onClose={() => setViewingHistory(null)}
        />
      )}
    </div>
  )
}

export default PostPage

