import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import Alert from '../components/Alert'
import CommentTree from '../components/CommentTree'
import './CommunityPage.css'

const API_BASE = 'http://localhost:3000/api'

function CommunityPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { alert, showAlert, hideAlert, showLoginAlert } = useAlert()
  const [community, setCommunity] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [composerContent, setComposerContent] = useState('')
  const [composerImage, setComposerImage] = useState(null)
  const [expandedPost, setExpandedPost] = useState(null)
  const [comments, setComments] = useState({})
  const [showComments, setShowComments] = useState({})
  const [newComment, setNewComment] = useState({})
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchCommunity()
  }, [slug])

  const fetchCommunity = async () => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch(`${API_BASE}/communities/${slug}`, { headers })
      if (response.ok) {
        const data = await response.json()
        setCommunity(data)
      } else {
        showAlert('Community not found', 'error')
        navigate('/communities')
      }
    } catch (error) {
      console.error('Failed to fetch community:', error)
      showAlert('Failed to load community', 'error')
    }
  }

  const fetchPosts = async () => {
    if (!community) return
    
    setLoading(true)
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch(`${API_BASE}/social/feed?community_id=${community.id}`, { headers })
      if (response.ok) {
        const data = await response.json()
        setPosts(data)
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (community) {
      fetchPosts()
    }
  }, [community])

  const handleJoin = async () => {
    if (!user) {
      showLoginAlert()
      return
    }

    try {
      const response = await fetch(`${API_BASE}/communities/${slug}/join`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        const error = await response.json()
        // If already a member, just refresh (don't show error)
        if (error.error === 'Already a member') {
          fetchCommunity()
          return
        }
        throw new Error(error.error || 'Failed to join')
      }

      const data = await response.json()
      if (data.already_member) {
        // Already a member, just refresh
        fetchCommunity()
        return
      }

      showAlert('Joined community!', 'success')
      fetchCommunity()
    } catch (error) {
      showAlert(error.message, 'error')
    }
  }

  const handleLeave = async () => {
    try {
      const response = await fetch(`${API_BASE}/communities/${slug}/leave`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to leave')
      }

      showAlert('Left community', 'success')
      fetchCommunity()
    } catch (error) {
      showAlert(error.message, 'error')
    }
  }

  const fetchComments = async (postId) => {
    try {
      const response = await fetch(`${API_BASE}/social/${postId}/comments`)
      if (response.ok) {
        const data = await response.json()
        setComments(prev => ({ ...prev, [postId]: data }))
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    }
  }

  const handleComment = async (postId, commentText, parentCommentId = null) => {
    if (!user) {
      showLoginAlert()
      return
    }

    if (!commentText || !commentText.trim()) return

    try {
      const response = await fetch(`${API_BASE}/social/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ comment: commentText, parent_comment_id: parentCommentId })
      })

      if (response.ok) {
        fetchComments(postId)
        fetchPosts()
      }
    } catch (error) {
      console.error('Failed to add comment:', error)
    }
  }

  const handlePost = async (e) => {
    e.preventDefault()
    if (!user) {
      showLoginAlert()
      return
    }

    const formData = new FormData()
    formData.append('content', composerContent)
    formData.append('community_id', community.id)
    if (composerImage) {
      formData.append('image', composerImage)
    }

    try {
      const response = await fetch(`${API_BASE}/social`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to post')
      }

      const post = await response.json()
      setPosts([post, ...posts])
      setComposerContent('')
      setComposerImage(null)
      setShowComposer(false)
      showAlert('Posted!', 'success')
    } catch (error) {
      showAlert(error.message, 'error')
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

  if (loading && !community) {
    return <div className="loading">Loading community...</div>
  }

  if (!community) {
    return null
  }

  return (
    <div className="community-page">
      <header className="community-header">
        <button className="back-btn" onClick={() => navigate('/communities')}>
          ← Back to Communities
        </button>
        
        <div className="community-banner">
          <div className="community-icon-large">{community.icon || '🎮'}</div>
          <div className="community-details">
            <h1>{community.name}</h1>
            <p className="community-owner">by @{community.owner_username}</p>
            {community.description && (
              <p className="community-description">{community.description}</p>
            )}
            <div className="community-stats">
              <span>👥 {community.member_count || 0} members</span>
              <span>📮 {community.post_count || 0} posts</span>
            </div>
          </div>
        </div>

        <div className="community-actions-header">
          {community.is_member ? (
            <>
              {user && (
                <button 
                  className="post-btn"
                  onClick={() => setShowComposer(true)}
                >
                  + Post
                </button>
              )}
              <button 
                className="leave-btn"
                onClick={handleLeave}
              >
                Leave
              </button>
            </>
          ) : (
            <button 
              className="join-btn"
              onClick={handleJoin}
            >
              Join Community
            </button>
          )}
        </div>
      </header>

      {showComposer && (
        <div className="post-composer">
          <form onSubmit={handlePost}>
            <textarea
              value={composerContent}
              onChange={(e) => setComposerContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              required
            />
            <div className="composer-actions">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setComposerImage(e.target.files[0])}
                ref={fileInputRef}
                style={{ display: 'none' }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                📷 Image
              </button>
              <div>
                <button type="button" onClick={() => setShowComposer(false)}>
                  Cancel
                </button>
                <button type="submit">Post</button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="community-posts">
        {loading ? (
          <div className="loading">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="no-posts">No posts yet. Be the first to post!</div>
        ) : (
          posts.map(post => (
            <div 
              key={post.id} 
              className="post-card"
              onClick={() => navigate(`/post/${post.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="post-header">
                <div className="post-author">
                  {post.avatar_url ? (
                    <img 
                      src={post.avatar_url} 
                      alt={post.username} 
                      className="avatar"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/user/${post.username}`)
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  ) : (
                    <div 
                      className="avatar-placeholder"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/user/${post.username}`)
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      👤
                    </div>
                  )}
                  <div>
                    <strong 
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/user/${post.username}`)
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      @{post.username}
                    </strong>
                    <span className="post-time">{formatTime(post.created_at)}</span>
                  </div>
                </div>
                {post.game_name && (
                  <span className="game-badge">{post.game_icon} {post.game_name}</span>
                )}
              </div>
              
              <div 
                className="post-content"
                dangerouslySetInnerHTML={{ 
                  __html: post.content
                    .replace(/@(\w+)/g, '<a href="/user/$1" class="mention-link">@$1</a>')
                    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
                }}
              />
              
              {post.image_url && (
                <img src={`http://localhost:3000${post.image_url}`} alt="Post" className="post-image" />
              )}
              
              <div className="post-actions" onClick={(e) => e.stopPropagation()}>
                <button>👍 {post.likes_count || 0}</button>
                <button onClick={(e) => {
                  e.stopPropagation()
                  setShowComments({ ...showComments, [post.id]: !showComments[post.id] })
                  if (!showComments[post.id]) {
                    fetchComments(post.id)
                  }
                }}>
                  💬 {post.comments_count || 0}
                </button>
                <button>🔄 {post.retweets_count || 0}</button>
                <button>📤 {post.shares_count || 0}</button>
              </div>

              {showComments[post.id] && (
                <div className="comments-section" onClick={(e) => e.stopPropagation()}>
                  <CommentTree 
                    postId={post.id}
                    comments={comments[post.id] || []}
                    postAuthorId={post.user_id}
                    onCommentAdded={() => {
                      fetchComments(post.id)
                      fetchPosts()
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
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

export default CommunityPage

