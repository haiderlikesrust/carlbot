import { useState, useEffect, useRef } from 'react'
import './InputDialog.css'

function InputDialog({ isOpen, onClose, onSubmit, title, placeholder, label, multiline = false, secondaryLabel, secondaryPlaceholder, onSecondarySubmit }) {
  const [input, setInput] = useState('')
  const [secondaryInput, setSecondaryInput] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setInput('')
      setSecondaryInput('')
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim()) {
      if (secondaryLabel && secondaryInput.trim()) {
        onSecondarySubmit?.(input.trim(), secondaryInput.trim())
      } else {
        onSubmit?.(input.trim(), secondaryInput.trim() || null)
      }
      onClose()
    }
  }

  const handleCancel = () => {
    setInput('')
    setSecondaryInput('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="input-dialog-overlay" onClick={handleCancel}>
      <div className="input-dialog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="input-dialog-header">
          <h3>{title}</h3>
          <button className="input-dialog-close" onClick={handleCancel}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="input-dialog-form">
          <div className="input-dialog-content">
            <label className="input-dialog-label">
              {label}
              {multiline ? (
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  className="input-dialog-textarea"
                  rows={4}
                  required
                />
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  className="input-dialog-input"
                  required
                />
              )}
            </label>
            {secondaryLabel && (
              <label className="input-dialog-label">
                {secondaryLabel}
                <input
                  type="text"
                  value={secondaryInput}
                  onChange={(e) => setSecondaryInput(e.target.value)}
                  placeholder={secondaryPlaceholder}
                  className="input-dialog-input"
                />
              </label>
            )}
          </div>
          <div className="input-dialog-actions">
            <button type="button" className="input-dialog-btn cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="input-dialog-btn submit-btn">
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default InputDialog

