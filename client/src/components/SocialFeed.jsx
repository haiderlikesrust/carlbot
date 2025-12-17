import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './SocialFeed.css'

function SocialFeed({ isOpen, onClose }) {
  const { user, token } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (isOpen) {
      fetchPosts()
    }
  }, [isOpen, page])

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch(`http://localhost:3000/api/social/feed?page=${page}&limit=20`, {
        headers
      })
      const data = await response.json()
      setPosts(data)
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLike = async (postId) => {
    if (!token) {
      alert('Please login to like posts')
      return
    }

    try {
      const response = await fetch(`http://localhost:3000/api/social/${postId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      setPosts(posts.map(post => 
        post.id === postId 
          ? { ...post, is_liked: data.liked, likes_count: data.liked ? post.likes_count + 1 : post.likes_count - 1 }
          : post
      ))
    } catch (error) {
      console.error('Failed to like post:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="social-feed-overlay" onClick={onClose}>
      <div className="social-feed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="social-feed-header">
          <h2>📱 Social Feed</h2>
          <button className="social-feed-close" onClick={onClose}>×</button>
        </div>
        
        <div className="social-feed-content">
          {loading ? (
            <div className="social-loading">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="social-empty">No posts yet. Be the first to share!</div>
          ) : (
            <div className="social-posts">
              {posts.map(post => (
                <div key={post.id} className="social-post">
                  <div className="post-header">
                    <div className="post-author">
                      {post.avatar_url && (
                        <img 
                          src={post.avatar_url.startsWith('http') ? post.avatar_url : `http://localhost:3000${post.avatar_url}`} 
                          alt={post.username} 
                          className="post-avatar"
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                      )}
                      <div>
                        <div className="post-username">{post.username}</div>
                        {post.game_name && (
                          <div className="post-game">
                            {post.game_icon} {post.game_name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="post-date">
                      {new Date(post.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  
                  {post.title && (
                    <h3 className="post-title">{post.title}</h3>
                  )}
                  
                  <div className="post-content">{post.content}</div>
                  
                  <div className="post-actions">
                    <button 
                      className={`post-action-btn ${post.is_liked ? 'liked' : ''}`}
                      onClick={() => handleLike(post.id)}
                      disabled={!token}
                    >
                      👍 {post.likes_count || 0}
                    </button>
                    <button className="post-action-btn" disabled>
                      💬 {post.comments_count || 0}
                    </button>
                    <button className="post-action-btn" disabled>
                      🔗 Share
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SocialFeed

