// Environment-aware configuration
const isDevelopment = import.meta.env.DEV
const isProduction = import.meta.env.PROD

// Get API base URL from environment or use defaults
export const API_BASE = import.meta.env.VITE_API_URL || 
  (isDevelopment ? 'http://localhost:3000/api' : '/api')

// Get Socket URL from environment or use defaults
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 
  (isDevelopment ? 'http://localhost:3000' : window.location.origin)

// Get client URL
export const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 
  (isDevelopment ? 'http://localhost:5173' : window.location.origin)

console.log('🔧 Config:', { API_BASE, SOCKET_URL, CLIENT_URL, isDevelopment, isProduction })
