import { useState } from 'react'
import './FunButton.css'

export default function FunButton({ 
  children, 
  onClick, 
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  ...props 
}) {
  const [isPressed, setIsPressed] = useState(false)
  const [ripples, setRipples] = useState([])

  const handleClick = (e) => {
    if (disabled) return
    
    // Create ripple effect
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const newRipple = { x, y, id: Date.now() }
    setRipples([...ripples, newRipple])
    
    setTimeout(() => {
      setRipples(ripples.filter(r => r.id !== newRipple.id))
    }, 600)
    
    onClick?.(e)
  }

  return (
    <button
      className={`fun-btn fun-btn-${variant} fun-btn-${size} ${className} ${isPressed ? 'pressed' : ''}`}
      onClick={handleClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      disabled={disabled}
      {...props}
    >
      <span className="fun-btn-content">{children}</span>
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="ripple-effect"
          style={{
            left: `${ripple.x}px`,
            top: `${ripple.y}px`
          }}
        />
      ))}
    </button>
  )
}
