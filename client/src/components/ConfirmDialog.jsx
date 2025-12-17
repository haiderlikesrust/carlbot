import './ConfirmDialog.css'

function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'info' }) {
  if (!isOpen) return null

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <h3>{title}</h3>
          <button className="confirm-dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="confirm-dialog-content">
          <p>{message}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel-btn" onClick={onClose}>
            {cancelText}
          </button>
          <button className="confirm-dialog-btn confirm-btn" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog

