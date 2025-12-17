import { createPortal } from 'react-dom'
import './CustomDialog.css'

export function showConfirm(message, title = 'Confirm') {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const handleConfirm = () => {
      document.body.removeChild(container)
      resolve(true)
    }

    const handleCancel = () => {
      document.body.removeChild(container)
      resolve(false)
    }

    const ConfirmComponent = () => (
      <div className="custom-dialog-overlay" onClick={handleCancel}>
        <div className="custom-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="custom-dialog-header">
            <h3>{title}</h3>
            <button className="custom-dialog-close" onClick={handleCancel}>×</button>
          </div>
          <div className="custom-dialog-body">
            <p>{message}</p>
          </div>
          <div className="custom-dialog-actions">
            <button className="custom-dialog-btn cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button className="custom-dialog-btn primary" onClick={handleConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    )

    // Render using React (if available) or plain DOM
    if (window.React && window.ReactDOM) {
      window.ReactDOM.render(<ConfirmComponent />, container)
    } else {
      // Fallback to plain DOM
      container.innerHTML = `
        <div class="custom-dialog-overlay">
          <div class="custom-dialog">
            <div class="custom-dialog-header">
              <h3>${title}</h3>
              <button class="custom-dialog-close" onclick="this.closest('.custom-dialog-overlay').remove(); arguments[0].call(null, false);">×</button>
            </div>
            <div class="custom-dialog-body">
              <p>${message}</p>
            </div>
            <div class="custom-dialog-actions">
              <button class="custom-dialog-btn cancel" onclick="this.closest('.custom-dialog-overlay').remove(); arguments[0].call(null, false);">Cancel</button>
              <button class="custom-dialog-btn primary" onclick="this.closest('.custom-dialog-overlay').remove(); arguments[0].call(null, true);">Confirm</button>
            </div>
          </div>
        </div>
      `
    }
  })
}

// React component version
export function CustomConfirm({ message, title = 'Confirm', onConfirm, onCancel }) {
  return createPortal(
    <div className="custom-dialog-overlay" onClick={onCancel}>
      <div className="custom-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="custom-dialog-header">
          <h3>{title}</h3>
          <button className="custom-dialog-close" onClick={onCancel}>×</button>
        </div>
        <div className="custom-dialog-body">
          <p>{message}</p>
        </div>
        <div className="custom-dialog-actions">
          <button className="custom-dialog-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="custom-dialog-btn primary" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
