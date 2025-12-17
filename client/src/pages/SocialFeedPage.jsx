import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import Alert from '../components/Alert'
import CommentTree from '../components/CommentTree'
import EditPostModal from '../components/EditPostModal'
import EditHistoryModal from '../components/EditHistoryModal'
import './SocialFeedPage.css'

const API_BASE = 'http://localhost:3000/api'

function SocialFeedPage() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { alert, showAlert, hideAlert, showLoginAlert } = useAlert()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [showComposer, setShowComposer] = useState(false)
  const [composerContent, setComposerContent] = useState('')
  const [composerImage, setComposerImage] = useState(null)
  const [expandedPost, setExpandedPost] = useState(null)
  const [comments, setComments] = useState({})
  const [showComments, setShowComments] = useState({})
  const [newComment, setNewComment] = useState({})
  const [selectedCommunity, setSelectedCommunity] = useState(null)
  const [userCommunities, setUserCommunities] = useState([])
  const [communityFilter, setCommunityFilter] = useState(null)
  const [editingPost, setEditingPost] = useState(null)
  const [viewingHistory, setViewingHistory] = useState(null)
  const [trendingPosts, setTrendingPosts] = useState([])
  const [trendingHashtags, setTrendingHashtags] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchPosts()
    fetchTrending()
    fetchTrendingHashtags()
    if (token) {
      fetchUserCommunities()
    }
  }, [page, token])

  const fetchUserCommunities = async () => {
    try {
      const response = await fetch(`${API_BASE}/communities/user/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setUserCommunities(data)
      }
    } catch (error) {
      console.error('Failed to fetch user communities:', error)
    }
  }

  const fetchTrending = async () => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const response = await fetch(`${API_BASE}/social/trending?limit=5`, { headers })
      if (response.ok) {
        const data = await response.json()
        setTrendingPosts(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch trending posts:', error)
    }
  }

  const fetchTrendingHashtags = async () => {
    try {
      // Try intelligent trending first (AI-powered topic detection)
      const intelligentResponse = await fetch(`${API_BASE}/hashtags/intelligent-trending?limit=10`)
      if (intelligentResponse.ok) {
        const intelligentData = await intelligentResponse.json()
        if (intelligentData && intelligentData.length > 0) {
          setTrendingHashtags(intelligentData)
          return
        }
      }
      
      // Fallback to regular hashtag trending
      const response = await fetch(`${API_BASE}/hashtags/trending?limit=10`)
      if (response.ok) {
        const data = await response.json()
        setTrendingHashtags(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch trending hashtags:', error)
      // Try fallback
      try {
        const response = await fetch(`${API_BASE}/hashtags/trending?limit=10`)
        if (response.ok) {
          const data = await response.json()
          setTrendingHashtags(data || [])
        }
      } catch (fallbackError) {
        console.error('Fallback fetch also failed:', fallbackError)
      }
    }
  }

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const params = new URLSearchParams({ page, limit: 20 })
      if (communityFilter) {
        params.append('community_id', communityFilter)
      }
      const response = await fetch(`${API_BASE}/social/feed?${params}`, {
        headers
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch posts')
      }
      const data = await response.json()
      // Ensure data is an array
      setPosts(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch posts:', error)
      showAlert(error.message || 'Failed to load posts', 'error')
      setPosts([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const fetchComments = async (postId) => {
    try {
      const response = await fetch(`${API_BASE}/social/${postId}/comments`)
      const data = await response.json()
      setComments(prev => ({ ...prev, [postId]: data }))
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    }
  }

  const handleLike = async (postId) => {
    if (!token) {
      showLoginAlert('liking posts')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/social/${postId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      setPosts(posts.map(post => 
        post.id === postId 
          ? { ...post, is_liked: data.liked, likes_count: data.liked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 0) - 1) }
          : post
      ))
    } catch (error) {
      console.error('Failed to like post:', error)
    }
  }

  const handleRetweet = async (postId) => {
    if (!token) {
      showLoginAlert('retweeting posts')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/social/${postId}/retweet`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      setPosts(posts.map(post => 
        post.id === postId 
          ? { ...post, is_retweeted: data.retweeted, retweets_count: data.retweeted ? (post.retweets_count || 0) + 1 : Math.max(0, (post.retweets_count || 0) - 1) }
          : post
      ))
    } catch (error) {
      console.error('Failed to retweet post:', error)
    }
  }

  const handleShare = async (postId) => {
    if (!token) {
      showLoginAlert('sharing posts')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/social/${postId}/share`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPosts(posts.map(post => 
          post.id === postId 
            ? { ...post, is_shared: true, shares_count: (post.shares_count || 0) + 1 }
            : post
        ))
        showAlert('Post shared!', 'success')
      } else {
        const data = await response.json()
        showAlert(data.error || 'Failed to share post', 'error')
      }
    } catch (error) {
      console.error('Failed to share post:', error)
      showAlert('Failed to share post', 'error')
    }
  }

  const handleComment = async (postId) => {
    if (!token) {
      showLoginAlert('commenting')
      return
    }

    const commentText = newComment[postId]
    if (!commentText || !commentText.trim()) return

    try {
      const response = await fetch(`${API_BASE}/social/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ comment: commentText })
      })

      if (response.ok) {
        setNewComment(prev => ({ ...prev, [postId]: '' }))
        // Refresh comments to get nested structure
        fetchComments(postId)
        setPosts(posts.map(post => 
          post.id === postId 
            ? { ...post, comments_count: (post.comments_count || 0) + 1 }
            : post
        ))
      }
    } catch (error) {
      console.error('Failed to add comment:', error)
    }
  }

  // Auto-detect links from text content
  const detectLink = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const matches = text.match(urlRegex)
    return matches ? matches[0] : null
  }

  const handleEditSuccess = (updatedPost) => {
    setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p))
    showAlert('Post updated successfully!', 'success')
  }

  const handleCreatePost = async () => {
    if (!token) {
      showLoginAlert('creating posts')
      return
    }

    if (!composerContent.trim() && !composerImage) {
      showAlert('Please add content or an image', 'warning')
      return
    }

    try {
      const formData = new FormData()
      formData.append('content', composerContent)
      if (composerImage) {
        formData.append('image', composerImage)
      }
      
      // Auto-detect link from content
      const detectedLink = detectLink(composerContent)
      if (detectedLink) {
        formData.append('link_url', detectedLink)
      }

      const response = await fetch(`${API_BASE}/social`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setPosts([data, ...posts])
        setComposerContent('')
        setComposerImage(null)
        setShowComposer(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        showAlert('Post created successfully!', 'success')
      } else {
        const data = await response.json()
        showAlert(data.error || 'Failed to create post', 'error')
      }
    } catch (error) {
      console.error('Failed to create post:', error)
      showAlert('Failed to create post', 'error')
    }
  }

  const toggleComments = (postId) => {
    if (!showComments[postId]) {
      fetchComments(postId)
    }
    setShowComments(prev => ({ ...prev, [postId]: !prev[postId] }))
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return date.toLocaleDateString()
  }

  const formatLinks = (text) => {
    if (!text) return ''
    // First format mentions, then format links
    let formatted = text.replace(/@(\w+)/g, '<a href="/user/$1" class="mention-link">@$1</a>')
    const urlRegex = /(https?:\/\/[^\s]+)/g
    return formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
  }

  return (
    <div className="social-feed-page">
      <header className="social-header">
        <div className="social-header-content">
          <button className="back-btn" onClick={() => navigate('/')}>
            ← Back
          </button>
          <h1>📱 Social Feed</h1>
          <div className="header-actions">
            {userCommunities.length > 0 && (
              <select
                className="community-filter"
                value={communityFilter || ''}
                onChange={(e) => setCommunityFilter(e.target.value || null)}
              >
                <option value="">All Posts</option>
                {userCommunities.map(comm => (
                  <option key={comm.id} value={comm.id}>
                    {comm.icon} {comm.name}
                  </option>
                ))}
              </select>
            )}
            <button 
              className="compose-btn" 
              onClick={() => {
                if (!user) {
                  showLoginAlert('creating posts')
                  return
                }
                setShowComposer(true)
              }}
            >
              ✏️ Compose
            </button>
          </div>
        </div>
      </header>

      {showComposer && (
        <div className="composer-modal">
          <div className="composer-content">
            <div className="composer-header">
              <h2>Create Post</h2>
              <button className="close-btn" onClick={() => setShowComposer(false)}>×</button>
            </div>
            {userCommunities.length > 0 && (
              <div className="composer-community-selector">
                <label>Post to community (optional):</label>
                <select
                  value={selectedCommunity || ''}
                  onChange={(e) => setSelectedCommunity(e.target.value || null)}
                >
                  <option value="">No community</option>
                  {userCommunities.map(comm => (
                    <option key={comm.id} value={comm.id}>
                      {comm.icon} {comm.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <textarea
              className="composer-textarea"
              placeholder="What's on your mind?"
              value={composerContent}
              onChange={(e) => setComposerContent(e.target.value)}
              rows={6}
            />
            {composerImage && (
              <div className="composer-image-preview">
                <img src={URL.createObjectURL(composerImage)} alt="Preview" />
                <button onClick={() => setComposerImage(null)}>Remove</button>
              </div>
            )}
            <div className="composer-actions">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={(e) => setComposerImage(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <button onClick={() => fileInputRef.current?.click()}>📷 Add Image</button>
              <button onClick={handleCreatePost} className="post-btn">Post</button>
            </div>
          </div>
        </div>
      )}

      <div className="social-feed-container">
        <div className="social-feed-main">
          {loading ? (
            <div className="social-loading">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="social-empty">No posts yet. Be the first to share!</div>
          ) : (
            <div className="social-posts-list">
            {posts.map((post, index) => (
              <div 
                key={post.id} 
                className="social-post-card"
                onClick={() => navigate(`/post/${post.id}`)}
                style={{ 
                  cursor: 'pointer',
                  animationDelay: `${index * 0.1}s`
                }}
              >
                <div className="post-header">
                  <div className="post-author">
                    {post.avatar_url && (
                      <img 
                        src={post.avatar_url.startsWith('http') ? post.avatar_url : `http://localhost:3000${post.avatar_url}`} 
                        alt={post.username} 
                        className="post-avatar"
                        onError={(e) => {
                          e.target.style.display = 'none'
                          e.target.nextSibling?.style?.display === 'none' && (e.target.nextSibling.style.display = 'block')
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/user/${post.username}`)
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    )}
                    {!post.avatar_url && (
                      <div className="post-avatar-placeholder">👤</div>
                    )}
                    <div>
                      <div 
                        className="post-username"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/user/${post.username}`)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        @{post.username}
                      </div>
                      <div className="post-badges">
                        {post.community_name && (
                          <span 
                            className="community-badge"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/communities/${post.community_slug}`)
                            }}
                            title={`Posted in ${post.community_name}`}
                          >
                            {post.community_icon} Posted in {post.community_name}
                          </span>
                        )}
                        {post.game_name && (
                          <span className="game-badge">
                            {post.game_icon} {post.game_name}
                          </span>
                        )}
                        {(post.carlbot_liked > 0 || post.carlbot_commented > 0 || post.carlbot_retweeted > 0) && (
                          <span 
                            className="carlbot-badge"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate('/carlbot')
                            }}
                            title="Carlbot interacted with this post"
                          >
                            🤖 Interacted by Carlbot
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="post-meta">
                    <span className="post-time">
                      {formatTime(post.created_at)}
                      {post.edited_at && (
                        <span 
                          className="edited-badge" 
                          title={`Edited ${formatTime(post.edited_at)}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewingHistory(post.id)
                          }}
                        >
                          (edited)
                        </span>
                      )}
                    </span>
                    {user && post.user_id === user.id && (
                      <div className="post-owner-actions">
                        <button
                          className="edit-post-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingPost(post)
                          }}
                          title="Edit post"
                        >
                          ✏️
                        </button>
                        {post.edited_at && (
                          <button
                            className="view-history-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setViewingHistory(post.id)
                            }}
                            title="View edit history"
                          >
                            📜
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {post.title && (
                  <h3 className="post-title">{post.title}</h3>
                )}
                
                <div 
                  className="post-content"
                  dangerouslySetInnerHTML={{ __html: formatLinks(post.content) }}
                />
                
                {post.image_url && (
                  <div className="post-image">
                    <img src={`http://localhost:3000${post.image_url}`} alt="Post" />
                  </div>
                )}
                
                {post.link_url && (
                  <div className="post-link">
                    <a href={post.link_url} target="_blank" rel="noopener noreferrer">
                      🔗 {post.link_url}
                    </a>
                  </div>
                )}
                
                <div className="post-actions">
                  <button 
                    className={`post-action-btn ${post.is_liked ? 'liked' : ''}`}
                    onClick={() => handleLike(post.id)}
                    disabled={!token}
                  >
                    👍 {post.likes_count || 0}
                  </button>
                  <button 
                    className="post-action-btn"
                    onClick={() => toggleComments(post.id)}
                  >
                    💬 {post.comments_count || 0}
                  </button>
                  <button 
                    className={`post-action-btn ${post.is_retweeted ? 'retweeted' : ''}`}
                    onClick={() => handleRetweet(post.id)}
                    disabled={!token}
                  >
                    🔄 {post.retweets_count || 0}
                  </button>
                  <button 
                    className={`post-action-btn ${post.is_shared ? 'shared' : ''}`}
                    onClick={() => handleShare(post.id)}
                    disabled={!token}
                  >
                    🔗 {post.shares_count || 0}
                  </button>
                </div>

                {showComments[post.id] && (
                  <div className="post-comments">
                    <CommentTree
                      comments={comments[post.id] || []}
                      postAuthorId={post.user_id}
                      postId={post.id}
                      onCommentAdded={() => fetchComments(post.id)}
                    />
                    {token && (
                      <div className="comment-input">
                        <textarea
                          placeholder="Add a comment..."
                          value={newComment[post.id] || ''}
                          onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                          rows={3}
                          className="comment-textarea"
                        />
                        <button onClick={() => handleComment(post.id)} className="comment-submit-btn">
                          Post
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            </div>
          )}
        </div>

        <aside className="social-feed-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-header">
              <h3>📰 Today's News</h3>
              <button className="sidebar-close-btn" onClick={() => {}}>×</button>
            </div>
            <div className="news-list">
              {trendingPosts.slice(0, 3).map((post, idx) => (
                <div 
                  key={post.id} 
                  className="news-item"
                  onClick={() => navigate(`/post/${post.id}`)}
                >
                  <div className="news-thumbnail">
                    {post.avatar_url ? (
                      <img src={`http://localhost:3000${post.avatar_url}`} alt={post.username} />
                    ) : (
                      <div className="news-placeholder">📰</div>
                    )}
                  </div>
                  <div className="news-content">
                    <p className="news-headline">{post.content.substring(0, 60)}{post.content.length > 60 ? '...' : ''}</p>
                    <span className="news-meta">
                      {formatTime(post.created_at)} • {post.game_name || 'General'} • {post.likes_count + post.comments_count} interactions
                    </span>
                  </div>
                </div>
              ))}
              {trendingPosts.length === 0 && (
                <p className="no-news">No trending news yet</p>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <h3>🔥 Trending Today</h3>
              <button className="sidebar-menu-btn">⋯</button>
            </div>
            <div className="trending-list">
              {trendingHashtags.slice(0, 5).map((hashtag, idx) => {
                const tagName = hashtag.tag || hashtag.name || ''
                const tagDisplay = tagName.startsWith('#') ? tagName : `#${tagName}`
                return (
                  <div 
                    key={hashtag.id || idx} 
                    className="trending-item"
                    onClick={() => navigate(`/hashtag/${tagName.replace('#', '')}`)}
                  >
                    <div className="trending-info">
                      <span className="trending-category">
                        Gaming • Trending
                      </span>
                      <span className="trending-tag">{tagDisplay}</span>
                      <span className="trending-count">
                        {hashtag.recent_posts || hashtag.post_count || hashtag.count || 0} posts
                      </span>
                    </div>
                    <button className="trending-menu-btn">⋯</button>
                  </div>
                )
              })}
              {trendingHashtags.length === 0 && trendingPosts.length > 0 && (
                <>
                  {trendingPosts.slice(3, 8).map((post, idx) => {
                    const hashtags = post.content.match(/#\w+/g) || []
                    if (hashtags.length === 0) return null
                    return (
                      <div 
                        key={`trend-${post.id}-${idx}`} 
                        className="trending-item"
                        onClick={() => navigate(`/hashtag/${hashtags[0].replace('#', '')}`)}
                      >
                        <div className="trending-info">
                          <span className="trending-category">Gaming • Trending</span>
                          <span className="trending-tag">{hashtags[0]}</span>
                          <span className="trending-count">{post.likes_count + post.comments_count} interactions</span>
                        </div>
                        <button className="trending-menu-btn">⋯</button>
                      </div>
                    )
                  })}
                </>
              )}
              {trendingHashtags.length === 0 && trendingPosts.filter(p => p.content.match(/#\w+/g)).length === 0 && (
                <p className="no-trends">No trending topics yet</p>
              )}
              <button className="show-more-btn">Show more</button>
            </div>
          </div>
        </aside>
      </div>

      {editingPost && (
        <EditPostModal
          post={editingPost}
          isOpen={!!editingPost}
          onClose={() => setEditingPost(null)}
          onSuccess={handleEditSuccess}
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

export default SocialFeedPage

