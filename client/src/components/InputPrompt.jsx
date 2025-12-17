import { useState, useEffect, useRef } from 'react'
import './InputPrompt.css'

function InputPrompt({ isOpen, message, onConfirm, onCancel, placeholder = '', defaultValue = '' }) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen, defaultValue])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (onConfirm) {
      onConfirm(value)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    }
  }

  if (!isOpen) return null

  return (
    <div className="input-prompt-overlay" onClick={handleCancel}>
      <div className="input-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="input-prompt-header">
          <h3>Input Required</h3>
          <button className="input-prompt-close" onClick={handleCancel}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="input-prompt-form">
          <div className="input-prompt-body">
            <p className="input-prompt-message">{message}</p>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="input-prompt-input"
              autoFocus
            />
          </div>
          <div className="input-prompt-footer">
            <button type="button" className="input-prompt-btn cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="input-prompt-btn confirm-btn">
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default InputPrompt
