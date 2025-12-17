import { memo, useRef, useEffect, useState, useMemo } from 'react'

// Virtualized message list component for performance
const VirtualizedMessageList = memo(({ messages, renderMessage, itemHeight = 80, overscan = 5 }) => {
  const containerRef = useRef(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.min(50, messages.length) })
  const [containerHeight, setContainerHeight] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const updateVisibleRange = () => {
      const container = containerRef.current
      if (!container) return

      const scrollTop = container.scrollTop
      const viewportHeight = container.clientHeight
      
      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
      const end = Math.min(
        messages.length,
        Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
      )

      setVisibleRange({ start, end })
      setContainerHeight(container.clientHeight)
    }

    updateVisibleRange()
    container.addEventListener('scroll', updateVisibleRange, { passive: true })
    window.addEventListener('resize', updateVisibleRange)

    return () => {
      container.removeEventListener('scroll', updateVisibleRange)
      window.removeEventListener('resize', updateVisibleRange)
    }
  }, [messages.length, itemHeight, overscan])

  const visibleMessages = useMemo(() => {
    return messages.slice(visibleRange.start, visibleRange.end)
  }, [messages, visibleRange.start, visibleRange.end])

  const totalHeight = messages.length * itemHeight
  const offsetY = visibleRange.start * itemHeight

  return (
    <div 
      ref={containerRef}
      className="carlcord-messages-area virtualized"
      style={{ 
        position: 'relative',
        overflow: 'auto',
        height: '100%'
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleMessages.map((message, index) => {
            const actualIndex = visibleRange.start + index
            return (
              <div key={message.id} data-message-index={actualIndex}>
                {renderMessage(message, actualIndex)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

VirtualizedMessageList.displayName = 'VirtualizedMessageList'

export default VirtualizedMessageList
