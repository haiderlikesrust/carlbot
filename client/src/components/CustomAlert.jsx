import { createPortal } from 'react-dom'
import './CustomDialog.css'

export function showAlert(message, title = 'Alert') {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const handleClose = () => {
      document.body.removeChild(container)
      resolve()
    }

    const AlertComponent = () => (
      <div className="custom-dialog-overlay" onClick={handleClose}>
        <div className="custom-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="custom-dialog-header">
            <h3>{title}</h3>
            <button className="custom-dialog-close" onClick={handleClose}>×</button>
          </div>
          <div className="custom-dialog-body">
            <p>{message}</p>
          </div>
          <div className="custom-dialog-actions">
            <button className="custom-dialog-btn primary" onClick={handleClose}>
              OK
            </button>
          </div>
        </div>
      </div>
    )

    // Render using React (if available) or plain DOM
    if (window.React && window.ReactDOM) {
      window.ReactDOM.render(<AlertComponent />, container)
    } else {
      // Fallback to plain DOM
      container.innerHTML = `
        <div class="custom-dialog-overlay">
          <div class="custom-dialog">
            <div class="custom-dialog-header">
              <h3>${title}</h3>
              <button class="custom-dialog-close" onclick="this.closest('.custom-dialog-overlay').remove()">×</button>
            </div>
            <div class="custom-dialog-body">
              <p>${message}</p>
            </div>
            <div class="custom-dialog-actions">
              <button class="custom-dialog-btn primary" onclick="this.closest('.custom-dialog-overlay').remove()">OK</button>
            </div>
          </div>
        </div>
      `
    }
  })
}

// React component version
export function CustomAlert({ 
  message, 
  title = 'Alert', 
  onClose, 
  onConfirm, 
  onCancel,
  isOpen = true,
  type = 'info'
}) {
  if (!isOpen) return null

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm()
    }
    if (onClose) {
      onClose()
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    }
    if (onClose) {
      onClose()
    }
  }

  const displayTitle = title || (type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Alert')

  return createPortal(
    <div className="custom-dialog-overlay" onClick={handleCancel}>
      <div className="custom-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="custom-dialog-header">
          <h3>{displayTitle}</h3>
          <button className="custom-dialog-close" onClick={handleCancel}>×</button>
        </div>
        <div className="custom-dialog-body">
          <p>{message}</p>
        </div>
        <div className="custom-dialog-actions">
          {onConfirm ? (
            <>
              <button className="custom-dialog-btn cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button className="custom-dialog-btn primary" onClick={handleConfirm}>
                Confirm
              </button>
            </>
          ) : (
            <button className="custom-dialog-btn primary" onClick={handleCancel}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// Default export for compatibility
export default CustomAlert
