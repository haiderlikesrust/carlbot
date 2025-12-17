import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './GlobalSearch.css'

const API_BASE = 'http://localhost:3000/api'

function GlobalSearch() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [results, setResults] = useState(null)
  const [searchType, setSearchType] = useState('all')
  const searchRef = useRef(null)
  const debounceTimer = useRef(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    if (query.length >= 2) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        fetchAutocomplete()
      }, 300)
    } else {
      setSuggestions([])
    }
  }, [query])

  const fetchAutocomplete = async () => {
    try {
      const response = await fetch(`${API_BASE}/search/autocomplete?q=${encodeURIComponent(query)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error('Autocomplete error:', error)
    }
  }

  const performSearch = async () => {
    if (!query.trim()) return

    try {
      const response = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(query)}&type=${searchType}&limit=20`,
        {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }
      )
      if (response.ok) {
        const data = await response.json()
        setResults(data)
        setSuggestions([])
      }
    } catch (error) {
      console.error('Search error:', error)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    if (suggestion.type === 'user') {
      navigate(`/profile/${suggestion.username}`)
    } else if (suggestion.type === 'hashtag') {
      navigate(`/hashtag/${suggestion.username.replace('#', '')}`)
    } else if (suggestion.type === 'game') {
      navigate(`/games/${suggestion.username}`)
    }
    setIsOpen(false)
    setQuery('')
  }

  const handleResultClick = (result, type) => {
    if (type === 'post') {
      navigate(`/social?post=${result.id}`)
    } else if (type === 'user') {
      navigate(`/profile/${result.username}`)
    } else if (type === 'community') {
      navigate(`/communities/${result.slug}`)
    }
    setIsOpen(false)
  }

  if (!isOpen) {
    return (
      <button 
        className="global-search-trigger"
        onClick={() => setIsOpen(true)}
        title="Search (Ctrl+K)"
      >
        🔍 Search
      </button>
    )
  }

  return (
    <div className="global-search-overlay" onClick={() => setIsOpen(false)}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="global-search-header">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search posts, users, communities, games..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') performSearch()
            }}
            className="global-search-input"
            autoFocus
          />
          <button onClick={() => setIsOpen(false)} className="close-btn">×</button>
        </div>

        <div className="global-search-filters">
          <button 
            className={searchType === 'all' ? 'active' : ''}
            onClick={() => setSearchType('all')}
          >
            All
          </button>
          <button 
            className={searchType === 'posts' ? 'active' : ''}
            onClick={() => setSearchType('posts')}
          >
            Posts
          </button>
          <button 
            className={searchType === 'users' ? 'active' : ''}
            onClick={() => setSearchType('users')}
          >
            Users
          </button>
          <button 
            className={searchType === 'communities' ? 'active' : ''}
            onClick={() => setSearchType('communities')}
          >
            Communities
          </button>
        </div>

        {suggestions.length > 0 && !results && (
          <div className="global-search-suggestions">
            {suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="suggestion-item"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <span className="suggestion-type">{suggestion.type}</span>
                <span className="suggestion-name">{suggestion.username}</span>
              </div>
            ))}
          </div>
        )}

        {results && (
          <div className="global-search-results">
            {results.posts && results.posts.length > 0 && (
              <div className="results-section">
                <h3>Posts</h3>
                {results.posts.map(post => (
                  <div
                    key={post.id}
                    className="result-item"
                    onClick={() => handleResultClick(post, 'post')}
                  >
                    <div className="result-content">{post.content?.substring(0, 100)}...</div>
                    <div className="result-meta">@{post.username}</div>
                  </div>
                ))}
              </div>
            )}

            {results.users && results.users.length > 0 && (
              <div className="results-section">
                <h3>Users</h3>
                {results.users.map(user => (
                  <div
                    key={user.id}
                    className="result-item"
                    onClick={() => handleResultClick(user, 'user')}
                  >
                    <div className="result-avatar">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : '👤'}</div>
                    <div className="result-info">
                      <div className="result-name">@{user.username}</div>
                      <div className="result-bio">{user.bio}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {results.communities && results.communities.length > 0 && (
              <div className="results-section">
                <h3>Communities</h3>
                {results.communities.map(community => (
                  <div
                    key={community.id}
                    className="result-item"
                    onClick={() => handleResultClick(community, 'community')}
                  >
                    <div className="result-name">{community.name}</div>
                    <div className="result-meta">{community.members_count} members</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default GlobalSearch
