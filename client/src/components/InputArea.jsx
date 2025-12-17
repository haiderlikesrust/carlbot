import { useState, useRef, useEffect } from 'react'
import { startVoiceInput, stopVoiceInput, isVoiceInputSupported } from '../utils/voiceInput'

function InputArea({ onSend, onImageUpload, autoPlayVoice, setAutoPlayVoice, showAlert }) {
  const [message, setMessage] = useState('')
  const [isDisabled, setIsDisabled] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const fileInputRef = useRef(null)
  const voiceRecognitionRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!message.trim() || isDisabled) return
    
    setIsDisabled(true)
    onSend(message)
    setMessage('')
    setTimeout(() => setIsDisabled(false), 1000)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        if (showAlert) {
          showAlert('Please upload an image file', 'warning')
        }
        return
      }
      onImageUpload(file)
      e.target.value = ''
    }
  }

  const handleVoiceInput = () => {
    if (!isVoiceInputSupported()) {
      if (showAlert) {
        showAlert('Voice input is not supported in your browser', 'warning')
      }
      return
    }

    if (isListening) {
      stopVoiceInput(voiceRecognitionRef.current)
      setIsListening(false)
      voiceRecognitionRef.current = null
    } else {
      setIsListening(true)
      voiceRecognitionRef.current = startVoiceInput(
        (text, isInterim) => {
          if (!isInterim) {
            setMessage(text)
            setIsListening(false)
            voiceRecognitionRef.current = null
          } else {
            setMessage(text)
          }
        },
        (error) => {
          if (showAlert) {
            showAlert(error, 'error')
          }
          setIsListening(false)
          voiceRecognitionRef.current = null
        }
      )
    }
  }

  useEffect(() => {
    return () => {
      if (voiceRecognitionRef.current) {
        stopVoiceInput(voiceRecognitionRef.current)
      }
    }
  }, [])

  return (
    <div className="input-container">
      <div className="input-wrapper">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button className="image-button" onClick={handleImageClick} title="Upload Screenshot">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </button>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask me about games, builds, or strategies..."
          disabled={isDisabled}
          className="message-input"
        />
        {isVoiceInputSupported() && (
          <button 
            className={`voice-input-button ${isListening ? 'listening' : ''}`}
            onClick={handleVoiceInput}
            title="Voice input"
            type="button"
          >
            🎤
          </button>
        )}
        <button 
          className="send-button" 
          onClick={handleSubmit}
          disabled={isDisabled}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div className="controls">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={autoPlayVoice}
            onChange={(e) => setAutoPlayVoice(e.target.checked)}
          />
          <span>Auto-play voice responses</span>
        </label>
      </div>
    </div>
  )
}

export default InputArea

