function QuickActions({ onAction, user }) {
  const actions = [
    { 
      id: 'build-analysis', 
      icon: '⚔️', 
      label: 'Build Analysis', 
      description: 'Analyze your gaming builds',
      color: '#00ff41',
      category: 'analysis' 
    },
    { 
      id: 'meta-check', 
      icon: '📊', 
      label: 'Meta Check', 
      description: 'Check current game meta',
      color: '#00d4ff',
      category: 'analysis' 
    },
    { 
      id: 'strategy-help', 
      icon: '🎯', 
      label: 'Strategy', 
      description: 'Get strategic advice',
      color: '#9d4edd',
      category: 'help' 
    },
    { 
      id: 'game-tips', 
      icon: '💡', 
      label: 'Tips', 
      description: 'Pro gaming tips',
      color: '#ffaa00',
      category: 'help' 
    },
    { 
      id: 'build-library', 
      icon: '📚', 
      label: 'Build Library', 
      description: 'View saved builds',
      requiresAuth: true, 
      color: '#9d4edd',
      category: 'library' 
    },
    { 
      id: 'build-comparison', 
      icon: '🔍', 
      label: 'Compare Builds', 
      description: 'Compare two builds side-by-side',
      requiresAuth: true, 
      color: '#00ff41',
      category: 'analysis' 
    },
    { 
      id: 'add-game', 
      icon: '➕', 
      label: 'Add Game', 
      description: 'Add custom game',
      requiresAuth: true, 
      color: '#00d4ff',
      category: 'library' 
    }
  ]

  return (
    <div className="quick-actions">
      {actions.map(action => {
        if (action.requiresAuth && !user) return null
        return (
          <button
            key={action.id}
            className="quick-action-btn"
            onClick={() => onAction(action.id)}
            title={action.description || action.label}
            aria-label={action.label}
            style={{ '--action-color': action.color }}
          >
            <span className="quick-action-icon">{action.icon}</span>
            <div className="quick-action-content">
              <span className="quick-action-label">{action.label}</span>
              <span className="quick-action-desc">{action.description}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default QuickActions
