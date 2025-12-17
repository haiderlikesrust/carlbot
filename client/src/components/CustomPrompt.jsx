import { useState, createPortal } from 'react-dom'
import './CustomDialog.css'

export function showPrompt(message, defaultValue = '', title = 'Input') {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const handleSubmit = (value) => {
      document.body.removeChild(container)
      resolve(value)
    }

    const handleCancel = () => {
      document.body.removeChild(container)
      resolve(null)
    }

    // Create input element
    const input = document.createElement('input')
    input.type = 'text'
    input.value = defaultValue
    input.className = 'custom-dialog-input'
    input.placeholder = message

    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        handleSubmit(input.value)
      } else if (e.key === 'Escape') {
        handleCancel()
      }
    }

    input.addEventListener('keydown', handleKeyPress)

    container.innerHTML = `
      <div class="custom-dialog-overlay">
        <div class="custom-dialog">
          <div class="custom-dialog-header">
            <h3>${title}</h3>
            <button class="custom-dialog-close" onclick="this.closest('.custom-dialog-overlay').remove(); arguments[0].call(null, null);">×</button>
          </div>
          <div class="custom-dialog-body">
            <p>${message}</p>
            <input type="text" class="custom-dialog-input" value="${defaultValue}" placeholder="${message}" />
          </div>
          <div class="custom-dialog-actions">
            <button class="custom-dialog-btn cancel" onclick="this.closest('.custom-dialog-overlay').remove(); arguments[0].call(null, null);">Cancel</button>
            <button class="custom-dialog-btn primary" onclick="const input = this.closest('.custom-dialog').querySelector('.custom-dialog-input'); this.closest('.custom-dialog-overlay').remove(); arguments[0].call(null, input.value);">OK</button>
          </div>
        </div>
      </div>
    `

    // Focus input after render
    setTimeout(() => {
      const inputEl = container.querySelector('.custom-dialog-input')
      if (inputEl) {
        inputEl.focus()
        inputEl.select()
      }
    }, 100)
  })
}

// React component version
export function CustomPrompt({ message, defaultValue = '', title = 'Input', onSubmit, onCancel }) {
  const [value, setValue] = useState(defaultValue)

  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit(value.trim())
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return createPortal(
    <div className="custom-dialog-overlay" onClick={onCancel}>
      <div className="custom-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="custom-dialog-header">
          <h3>{title}</h3>
          <button className="custom-dialog-close" onClick={onCancel}>×</button>
        </div>
        <div className="custom-dialog-body">
          <p>{message}</p>
          <input
            type="text"
            className="custom-dialog-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={message}
            autoFocus
          />
        </div>
        <div className="custom-dialog-actions">
          <button className="custom-dialog-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="custom-dialog-btn primary" onClick={handleSubmit} disabled={!value.trim()}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Default export for compatibility (alias for InputPrompt)
export default CustomPrompt
