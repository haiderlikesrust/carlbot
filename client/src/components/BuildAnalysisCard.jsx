import { useState } from 'react'
import './BuildAnalysisCard.css'

function BuildAnalysisCard({ buildData, onSave, onShare, user }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  if (!buildData) return null

  const handleSave = async () => {
    if (!user) {
      alert('Please login to save builds')
      return
    }
    setIsSaving(true)
    if (onSave) {
      await onSave(buildData)
    }
    setTimeout(() => setIsSaving(false), 1000)
  }

  const handleShare = () => {
    if (onShare) {
      onShare(buildData)
    }
  }

  // Extract key stats from analysis if available
  const extractStats = (analysis) => {
    const stats = {
      strengths: [],
      weaknesses: [],
      rating: null,
      recommendations: []
    }
    
    // Try to find rating (1-10 scale mentioned in text)
    const ratingMatch = analysis.match(/rating[:\s]+(\d+)/i) || analysis.match(/(\d+)\/10/i)
    if (ratingMatch) {
      stats.rating = parseInt(ratingMatch[1])
    }

    // Extract strengths and weaknesses
    const strengthSection = analysis.match(/strengths?[:\s]+([^.]+)/i)
    const weaknessSection = analysis.match(/weaknesses?[:\s]+([^.]+)/i)
    
    if (strengthSection) {
      stats.strengths = strengthSection[1].split(',').map(s => s.trim()).filter(s => s)
    }
    if (weaknessSection) {
      stats.weaknesses = weaknessSection[1].split(',').map(s => s.trim()).filter(s => s)
    }

    return stats
  }

  const stats = extractStats(buildData.analysis || '')

  return (
    <div className="build-analysis-card">
      <div className="build-card-header">
        <div className="build-card-title-section">
          <h3 className="build-card-title">
            ⚔️ Build Analysis
            {buildData.gameName && (
              <span className="build-game-badge">🎮 {buildData.gameName}</span>
            )}
          </h3>
          {stats.rating && (
            <div className="build-rating">
              <div className="rating-value">{stats.rating}/10</div>
              <div className="rating-bar">
                <div 
                  className="rating-fill" 
                  style={{ width: `${(stats.rating / 10) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="build-card-actions">
          {user && (
            <button 
              className="build-action-btn save-btn"
              onClick={handleSave}
              disabled={isSaving}
              title="Save to library"
            >
              {isSaving ? '💾 Saving...' : '💾 Save'}
            </button>
          )}
          <button 
            className="build-action-btn share-btn"
            onClick={handleShare}
            title="Share to feed"
          >
            📱 Share
          </button>
          <button 
            className="build-action-btn expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      <div className="build-card-content">
        <div className="build-description-section">
          <h4>Build Description</h4>
          <p className="build-description-text">{buildData.buildDescription}</p>
        </div>

        {(stats.strengths.length > 0 || stats.weaknesses.length > 0) && (
          <div className="build-stats-grid">
            {stats.strengths.length > 0 && (
              <div className="stat-section strengths">
                <h4>✅ Strengths</h4>
                <ul>
                  {stats.strengths.map((strength, idx) => (
                    <li key={idx}>{strength}</li>
                  ))}
                </ul>
              </div>
            )}
            {stats.weaknesses.length > 0 && (
              <div className="stat-section weaknesses">
                <h4>⚠️ Weaknesses</h4>
                <ul>
                  {stats.weaknesses.map((weakness, idx) => (
                    <li key={idx}>{weakness}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className={`build-analysis-section ${isExpanded ? 'expanded' : ''}`}>
          <h4>Full Analysis</h4>
          <div className="analysis-text">
            {buildData.analysis}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BuildAnalysisCard
