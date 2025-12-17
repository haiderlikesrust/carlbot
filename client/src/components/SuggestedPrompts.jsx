import { useState } from 'react'
import './SuggestedPrompts.css'

const PROMPT_TEMPLATES = {
  general: [
    { icon: '⚔️', text: 'Analyze this build: [describe your build]', category: 'build' },
    { icon: '📊', text: 'What\'s the current meta for [game]?', category: 'meta' },
    { icon: '🎯', text: 'Best strategy for [game mode] in [game]?', category: 'strategy' },
    { icon: '💡', text: 'Pro tips for improving at [game]', category: 'tips' },
    { icon: '🔍', text: 'Compare these two builds: [build 1] vs [build 2]', category: 'compare' },
    { icon: '📈', text: 'What\'s trending in [game] right now?', category: 'trending' }
  ],
  build: [
    { icon: '⚔️', text: 'Is this build viable for ranked? [describe build]', category: 'build' },
    { icon: '🔄', text: 'How can I optimize this build? [describe build]', category: 'optimize' },
    { icon: '⚖️', text: 'What are the strengths and weaknesses of [build]?', category: 'analysis' }
  ],
  meta: [
    { icon: '📊', text: 'What builds are dominating [game] meta?', category: 'meta' },
    { icon: '🔄', text: 'Recent meta changes in [game]', category: 'meta' },
    { icon: '🏆', text: 'Top tier picks for [game] right now', category: 'meta' }
  ]
}

function SuggestedPrompts({ onSelectPrompt, currentGame }) {
  const [selectedCategory, setSelectedCategory] = useState('general')
  const [isExpanded, setIsExpanded] = useState(false)

  const prompts = PROMPT_TEMPLATES[selectedCategory] || PROMPT_TEMPLATES.general

  const handlePromptClick = (prompt) => {
    const text = prompt.text.replace(/\[.*?\]/g, '')
    if (onSelectPrompt) {
      onSelectPrompt(text)
    }
  }

  if (!isExpanded && prompts.length === 0) return null

  return (
    <div className="suggested-prompts">
      <div className="prompts-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="prompts-title">💡 Suggested Prompts</span>
        <span className="prompts-toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>
      {isExpanded && (
        <div className="prompts-content">
          <div className="prompt-categories">
            <button
              className={`category-btn ${selectedCategory === 'general' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('general')}
            >
              All
            </button>
            <button
              className={`category-btn ${selectedCategory === 'build' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('build')}
            >
              ⚔️ Builds
            </button>
            <button
              className={`category-btn ${selectedCategory === 'meta' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('meta')}
            >
              📊 Meta
            </button>
          </div>
          <div className="prompts-grid">
            {prompts.map((prompt, idx) => (
              <button
                key={idx}
                className="prompt-card"
                onClick={() => handlePromptClick(prompt)}
                title="Click to use this prompt"
              >
                <span className="prompt-icon">{prompt.icon}</span>
                <span className="prompt-text">{prompt.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SuggestedPrompts
