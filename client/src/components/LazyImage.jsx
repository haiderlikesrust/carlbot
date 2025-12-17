import { useState, useEffect, useRef, memo } from 'react'

// Lazy loading image component with intersection observer
const LazyImage = memo(({ src, alt, className, fallback, ...props }) => {
  const [imageSrc, setImageSrc] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef(null)

  useEffect(() => {
    if (!imgRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src)
            observer.disconnect()
          }
        })
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01
      }
    )

    observer.observe(imgRef.current)

    return () => {
      observer.disconnect()
    }
  }, [src])

  const handleLoad = () => {
    setIsLoaded(true)
  }

  const handleError = () => {
    setHasError(true)
    if (fallback) {
      setImageSrc(fallback)
    }
  }

  return (
    <img
      ref={imgRef}
      src={imageSrc || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect width="40" height="40" fill="%231a1a1a"/%3E%3C/svg%3E'}
      alt={alt}
      className={`${className || ''} ${isLoaded ? 'loaded' : 'loading'}`}
      onLoad={handleLoad}
      onError={handleError}
      loading="lazy"
      {...props}
    />
  )
})

LazyImage.displayName = 'LazyImage'

export default LazyImage
