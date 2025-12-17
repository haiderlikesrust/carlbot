import { useState, useEffect } from 'react'
import { getSavedBuilds, deleteBuild } from '../utils/storage'
import ConfirmDialog from './ConfirmDialog'
import InputDialog from './InputDialog'
import './BuildLibrary.css'

function BuildLibrary({ onLoadBuild, onClose }) {
  const [builds, setBuilds] = useState([])
  const [selectedBuild, setSelectedBuild] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, buildId: null })

  useEffect(() => {
    loadBuilds()
  }, [])

  const loadBuilds = () => {
    const savedBuilds = getSavedBuilds()
    setBuilds(savedBuilds)
  }

  const handleLoad = (build) => {
    if (onLoadBuild) {
      onLoadBuild(build)
    }
    if (onClose) {
      onClose()
    }
  }

  const handleDelete = (buildId, e) => {
    e.stopPropagation()
    setDeleteConfirm({ isOpen: true, buildId })
  }

  const confirmDelete = () => {
    if (deleteBuild(deleteConfirm.buildId)) {
      loadBuilds()
    }
    setDeleteConfirm({ isOpen: false, buildId: null })
  }

  const handleExport = (build, e) => {
    e.stopPropagation()
    const text = `Build: ${build.name || 'Untitled'}\nGame: ${build.gameName || 'N/A'}\n\n${build.description}\n\nAnalysis:\n${build.analysis || 'No analysis saved'}`
    navigator.clipboard.writeText(text)
    // Show a brief notification instead of alert
    const notification = document.createElement('div')
    notification.textContent = '✅ Build copied to clipboard!'
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: rgba(0, 255, 65, 0.9); color: #000; padding: 12px 20px; border-radius: 4px; border: 2px solid #00ff41; z-index: 10001; font-family: Courier New, monospace; font-weight: bold;'
    document.body.appendChild(notification)
    setTimeout(() => {
      notification.style.opacity = '0'
      notification.style.transition = 'opacity 0.3s'
      setTimeout(() => notification.remove(), 300)
    }, 2000)
  }

  return (
    <div className="build-library-overlay" onClick={onClose}>
      <div className="build-library-modal" onClick={(e) => e.stopPropagation()}>
        <div className="build-library-header">
          <h2>📚 Build Library</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="build-library-content">
          {builds.length === 0 ? (
            <div className="empty-state">
              <p>No saved builds yet.</p>
              <p>Save builds from build analysis to see them here.</p>
            </div>
          ) : (
            <div className="builds-list">
              {builds.map((build) => (
                <div 
                  key={build.id} 
                  className={`build-item ${selectedBuild?.id === build.id ? 'selected' : ''}`}
                  onClick={() => setSelectedBuild(build)}
                >
                  <div className="build-item-header">
                    <h3>{build.name || 'Untitled Build'}</h3>
                    <div className="build-item-actions">
                      <button 
                        className="action-btn export-btn"
                        onClick={(e) => handleExport(build, e)}
                        title="Copy to clipboard"
                      >
                        📋
                      </button>
                      <button 
                        className="action-btn delete-btn"
                        onClick={(e) => handleDelete(build.id, e)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {build.gameName && (
                    <div className="build-game">🎮 {build.gameName}</div>
                  )}
                  <div className="build-description">
                    {build.description.substring(0, 100)}
                    {build.description.length > 100 ? '...' : ''}
                  </div>
                  <div className="build-item-footer">
                    <button 
                      className="load-btn"
                      onClick={() => handleLoad(build)}
                    >
                      Load Build
                    </button>
                    <span className="build-date">
                      {new Date(build.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, buildId: null })}
        onConfirm={confirmDelete}
        title="Delete Build"
        message="Are you sure you want to delete this saved build?"
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  )
}

export default BuildLibrary

