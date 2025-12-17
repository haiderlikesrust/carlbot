import { useEffect } from 'react'
import './Alert.css'

function Alert({ isOpen, message, type = 'info', onClose, duration = 3000 }) {
  useEffect(() => {
    if (isOpen && duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isOpen, duration, onClose])

  if (!isOpen) return null

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    login: '🔐'
  }

  return (
    <div className={`alert-overlay`} onClick={onClose}>
      <div className={`alert-box alert-${type}`} onClick={(e) => e.stopPropagation()}>
        <div className="alert-content">
          <span className="alert-icon">{icons[type] || icons.info}</span>
          <span className="alert-message">{message}</span>
        </div>
        <button className="alert-close" onClick={onClose}>×</button>
      </div>
    </div>
  )
}

export default Alert

