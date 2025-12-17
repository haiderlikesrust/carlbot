import { useState } from 'react'
import './ConfettiButton.css'

export default function ConfettiButton({ children, onClick, ...props }) {
  const [confetti, setConfetti] = useState([])

  const handleClick = (e) => {
    // Create confetti particles
    const particles = Array.from({ length: 20 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100,
      y: -10,
      delay: Math.random() * 0.5,
      duration: 1 + Math.random() * 0.5,
      color: ['#00ff41', '#00d4ff', '#ff00ff', '#ffaa00'][Math.floor(Math.random() * 4)]
    }))
    
    setConfetti(particles)
    
    setTimeout(() => {
      setConfetti([])
    }, 2000)
    
    onClick?.(e)
  }

  return (
    <button className="confetti-btn" onClick={handleClick} {...props}>
      {children}
      {confetti.map(particle => (
        <span
          key={particle.id}
          className="confetti-particle"
          style={{
            left: `${particle.x}%`,
            '--delay': `${particle.delay}s`,
            '--duration': `${particle.duration}s`,
            '--color': particle.color
          }}
        />
      ))}
    </button>
  )
}
