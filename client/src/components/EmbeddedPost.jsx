import { useNavigate } from 'react-router-dom'
import './EmbeddedPost.css'

function EmbeddedPost({ post }) {
  const navigate = useNavigate()

  if (!post) return null

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
    const urlRegex = /(https?:\/\/[^\s]+)/g
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
  }

  return (
    <div className="embedded-post" onClick={() => navigate(`/social?post=${post.id}`)}>
      <div className="embedded-post-header">
        <div className="embedded-post-author">
          {post.avatar_url ? (
            <img 
              src={post.avatar_url.startsWith('http') ? post.avatar_url : `http://localhost:3000${post.avatar_url}`} 
              alt={post.username} 
              className="embedded-avatar"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          ) : (
            <div className="embedded-avatar-placeholder">👤</div>
          )}
          <div className="embedded-author-info">
            <span className="embedded-username">@{post.username}</span>
            {post.game_name && (
              <span className="embedded-game">{post.game_icon} {post.game_name}</span>
            )}
          </div>
        </div>
        <span className="embedded-time">{formatTime(post.created_at)}</span>
      </div>
      
      <div 
        className="embedded-content"
        dangerouslySetInnerHTML={{ __html: formatLinks(post.content.substring(0, 200) + (post.content.length > 200 ? '...' : '')) }}
      />
      
      {post.image_url && (
        <div className="embedded-image">
          <img src={`http://localhost:3000${post.image_url}`} alt="Post" />
        </div>
      )}
      
      <div className="embedded-stats">
        <span>👍 {post.likes_count || 0}</span>
        <span>💬 {post.comments_count || 0}</span>
        <span>🔄 {post.retweets_count || 0}</span>
      </div>
    </div>
  )
}

export default EmbeddedPost

