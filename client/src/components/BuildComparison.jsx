import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './BuildComparison.css'

const API_BASE = 'http://localhost:3000/api'

function BuildComparison({ isOpen, onClose }) {
  const { token } = useAuth()
  const [build1Data, setBuild1Data] = useState('')
  const [build2Data, setBuild2Data] = useState('')
  const [build1Name, setBuild1Name] = useState('Build 1')
  const [build2Name, setBuild2Name] = useState('Build 2')
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCompare = async () => {
    if (!build1Data.trim() || !build2Data.trim()) {
      setError('Both builds are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Parse build data (expecting JSON format)
      let build1, build2
      try {
        build1 = typeof build1Data === 'string' ? JSON.parse(build1Data) : build1Data
        build2 = typeof build2Data === 'string' ? JSON.parse(build2Data) : build2Data
      } catch (parseError) {
        // If not JSON, create simple structure
        build1 = { name: build1Name, items: build1Data.split(',').map(i => i.trim()), stats: {} }
        build2 = { name: build2Name, items: build2Data.split(',').map(i => i.trim()), stats: {} }
      }

      const response = await fetch(`${API_BASE}/builds/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          build1Data: build1,
          build2Data: build2
        })
      })

      if (response.ok) {
        const data = await response.json()
        setComparison(data)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to compare builds')
      }
    } catch (error) {
      console.error('Compare error:', error)
      setError('Failed to compare builds')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setBuild1Data('')
    setBuild2Data('')
    setBuild1Name('Build 1')
    setBuild2Name('Build 2')
    setComparison(null)
    setError('')
  }

  if (!isOpen) return null

  return (
    <div className="build-comparison-overlay" onClick={onClose}>
      <div className="build-comparison-modal" onClick={(e) => e.stopPropagation()}>
        <div className="build-comparison-header">
          <h2>🔍 Build Comparison</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {!comparison ? (
          <div className="build-comparison-form">
            {error && <div className="error-message">{error}</div>}

            <div className="build-input-section">
              <div className="build-input-group">
                <label>Build 1 Name</label>
                <input
                  type="text"
                  value={build1Name}
                  onChange={(e) => setBuild1Name(e.target.value)}
                  placeholder="Build 1"
                  className="build-name-input"
                />
                <label>Build 1 Data (JSON or comma-separated items)</label>
                <textarea
                  value={build1Data}
                  onChange={(e) => setBuild1Data(e.target.value)}
                  placeholder='{"items": ["item1", "item2"], "stats": {"damage": 100}} or item1, item2, item3'
                  className="build-data-input"
                  rows={6}
                />
              </div>

              <div className="vs-divider">VS</div>

              <div className="build-input-group">
                <label>Build 2 Name</label>
                <input
                  type="text"
                  value={build2Name}
                  onChange={(e) => setBuild2Name(e.target.value)}
                  placeholder="Build 2"
                  className="build-name-input"
                />
                <label>Build 2 Data (JSON or comma-separated items)</label>
                <textarea
                  value={build2Data}
                  onChange={(e) => setBuild2Data(e.target.value)}
                  placeholder='{"items": ["item1", "item2"], "stats": {"damage": 100}} or item1, item2, item3'
                  className="build-data-input"
                  rows={6}
                />
              </div>
            </div>

            <div className="build-comparison-actions">
              <button onClick={handleCompare} disabled={loading} className="compare-btn">
                {loading ? 'Comparing...' : 'Compare Builds'}
              </button>
            </div>
          </div>
        ) : (
          <div className="build-comparison-results">
            <div className="results-header">
              <h3>Comparison Results</h3>
              <button onClick={handleReset} className="reset-btn">New Comparison</button>
            </div>

            <div className="comparison-side-by-side">
              <div className="build-column">
                <h4>{comparison.build1.name}</h4>
                <div className="build-items">
                  <h5>Items:</h5>
                  {comparison.build1.items.map((item, idx) => {
                    const isSimilar = comparison.similarities.items.includes(
                      typeof item === 'object' ? (item.id || item.name) : item
                    )
                    return (
                      <div key={idx} className={`build-item ${isSimilar ? 'similar' : ''}`}>
                        {typeof item === 'object' ? (item.name || item.id) : item}
                      </div>
                    )
                  })}
                </div>
                {Object.keys(comparison.build1.stats).length > 0 && (
                  <div className="build-stats">
                    <h5>Stats:</h5>
                    {Object.entries(comparison.build1.stats).map(([stat, value]) => (
                      <div key={stat} className="stat-item">
                        <span className="stat-name">{stat}:</span>
                        <span className="stat-value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="comparison-middle">
                <div className="differences-section">
                  <h5>Differences</h5>
                  <div className="differences-list">
                    {comparison.differences.items.length > 0 ? (
                      comparison.differences.items.map((item, idx) => (
                        <div key={idx} className="difference-item">{item}</div>
                      ))
                    ) : (
                      <div className="no-differences">No item differences</div>
                    )}
                  </div>
                </div>

                <div className="similarities-section">
                  <h5>Similarities</h5>
                  <div className="similarities-list">
                    {comparison.similarities.items.length > 0 ? (
                      comparison.similarities.items.map((item, idx) => (
                        <div key={idx} className="similarity-item">{item}</div>
                      ))
                    ) : (
                      <div className="no-similarities">No common items</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="build-column">
                <h4>{comparison.build2.name}</h4>
                <div className="build-items">
                  <h5>Items:</h5>
                  {comparison.build2.items.map((item, idx) => {
                    const isSimilar = comparison.similarities.items.includes(
                      typeof item === 'object' ? (item.id || item.name) : item
                    )
                    return (
                      <div key={idx} className={`build-item ${isSimilar ? 'similar' : ''}`}>
                        {typeof item === 'object' ? (item.name || item.id) : item}
                      </div>
                    )
                  })}
                </div>
                {Object.keys(comparison.build2.stats).length > 0 && (
                  <div className="build-stats">
                    <h5>Stats:</h5>
                    {Object.entries(comparison.build2.stats).map(([stat, value]) => (
                      <div key={stat} className="stat-item">
                        <span className="stat-name">{stat}:</span>
                        <span className="stat-value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {Object.keys(comparison.differences.stats).length > 0 && (
              <div className="stats-comparison">
                <h4>Stat Differences</h4>
                <div className="stats-diff-grid">
                  {Object.entries(comparison.differences.stats).map(([stat, diff]) => (
                    <div key={stat} className="stat-diff-item">
                      <div className="stat-diff-name">{stat}</div>
                      <div className="stat-diff-values">
                        <span className="stat-diff-build1">{diff.build1}</span>
                        <span className="stat-diff-arrow">→</span>
                        <span className="stat-diff-build2">{diff.build2}</span>
                        <span className={`stat-diff-change ${diff.difference >= 0 ? 'positive' : 'negative'}`}>
                          ({diff.difference >= 0 ? '+' : ''}{diff.difference})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default BuildComparison
