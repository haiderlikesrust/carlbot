import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import LoadingScreen from './LoadingScreen'
import './PageTransition.css'

function PageTransition({ children }) {
  const location = useLocation()
  const [isLoading, setIsLoading] = useState(false)
  const [displayLocation, setDisplayLocation] = useState(location)

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setIsLoading(true)
      const timer = setTimeout(() => {
        setDisplayLocation(location)
        setIsLoading(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [location, displayLocation])

  return (
    <>
      {isLoading && <LoadingScreen />}
      <div className={`page-content ${isLoading ? 'hidden' : 'visible'}`}>
        {children}
      </div>
    </>
  )
}

export default PageTransition
