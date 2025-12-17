import { useEffect, useRef, useState } from 'react'
import EmbeddedPost from './EmbeddedPost'

function Message({ message, apiBase, onShare, embeds }) {
  const contentRef = useRef(null)
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    if (message.useTypingAnimation && message.role === 'bot' && !message.isError) {
      typeMessage(message.text, 20)
    } else {
      const formatted = formatMessage(message.text)
      setDisplayedText(formatted)
      setIsTyping(false)
    }
  }, [message])

  const typeMessage = (text, speed = 20) => {
    setIsTyping(true)
    const plainText = text.replace(/<[^>]*>/g, '')
    let index = 0

    const typeInterval = setInterval(() => {
      if (index < plainText.length) {
        const currentText = plainText.substring(0, index + 1)
        let formatted = currentText
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
        
        formatted += '<span class="typing-cursor">|</span>'
        setDisplayedText(formatted)
        index++
      } else {
        // Final formatting
        const finalText = formatMessage(text)
        setDisplayedText(finalText)
        setIsTyping(false)
        clearInterval(typeInterval)
      }
    }, speed)
  }

  const formatMessage = (text) => {
    let formatted = text.replace(/\n/g, '<br>')
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>')
    formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    return formatted
  }

  const copyMessage = () => {
    navigator.clipboard.writeText(message.text).then(() => {
      showNotification('Copied!')
    })
  }

  const likeMessage = () => {
    // Like functionality
  }

  const showNotification = (text) => {
    const notification = document.createElement('div')
    notification.className = 'copy-notification'
    notification.textContent = text
    document.body.appendChild(notification)
    setTimeout(() => notification.classList.add('show'), 10)
    setTimeout(() => {
      notification.classList.remove('show')
      setTimeout(() => notification.remove(), 300)
    }, 2000)
  }

  const formattedText = displayedText || formatMessage(message.text)

  return (
    <div className={`message ${message.role}-message`}>
      <div className="message-wrapper">
        {message.role === 'bot' && !message.isError && (
          <div className="message-actions">
            <button className="message-action-btn" onClick={copyMessage} title="Copy message">
              📋
            </button>
            <button className="message-action-btn" onClick={likeMessage} title="Like">
              👍
            </button>
            {onShare && (
              <button 
                className="message-action-btn" 
                onClick={() => onShare(message.text, 'response')} 
                title="Share to feed"
              >
                📱
              </button>
            )}
          </div>
        )}
        <div 
          className={`message-content ${message.isError ? 'error-message' : ''}`}
          ref={contentRef}
        >
          <div dangerouslySetInnerHTML={{ __html: formattedText }} />
          {embeds && embeds.length > 0 && (
            <div className="message-embeds">
              {embeds.map((post, index) => (
                <EmbeddedPost key={post.id || index} post={post} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="message-timestamp">
        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

export default Message

