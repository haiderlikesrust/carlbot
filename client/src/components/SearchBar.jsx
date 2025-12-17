import { useState } from 'react'
import './SearchBar.css'

function SearchBar({ messages, onSearchResult }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const handleSearch = (query) => {
    if (!query.trim()) {
      onSearchResult(null)
      return
    }

    const results = messages.filter(msg => 
      msg.text.toLowerCase().includes(query.toLowerCase())
    )
    onSearchResult(results)
  }

  const handleChange = (e) => {
    const query = e.target.value
    setSearchQuery(query)
    handleSearch(query)
  }

  return (
    <div className="search-bar-container">
      <button 
        className="search-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Search messages (Ctrl+F)"
      >
        🔍
      </button>
      {isOpen && (
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={handleChange}
            className="search-input"
            autoFocus
          />
          <button 
            className="search-close-btn"
            onClick={() => {
              setIsOpen(false)
              setSearchQuery('')
              onSearchResult(null)
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export default SearchBar

