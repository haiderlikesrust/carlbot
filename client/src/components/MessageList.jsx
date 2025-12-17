import { useEffect, useRef } from 'react'
import Message from './Message'

function MessageList({ messages, isTyping, apiBase, autoPlayVoice, highlightQuery, onShare }) {
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="chat-messages">
      {highlightQuery && (
        <div className="search-results-header">
          Found {messages.length} result{messages.length !== 1 ? 's' : ''}
        </div>
      )}
      {messages.map((message, index) => (
        <Message 
          key={message.id ? `msg-${message.id}-${index}` : `msg-${index}-${Date.now()}`} 
          message={message} 
          apiBase={apiBase} 
          onShare={onShare} 
          embeds={message.embeds} 
        />
      ))}
      {isTyping && (
        <div className="message bot-message">
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}

export default MessageList

