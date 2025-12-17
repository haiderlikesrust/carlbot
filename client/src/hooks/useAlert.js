import { useState } from 'react'

export function useAlert() {
  const [alert, setAlert] = useState({
    isOpen: false,
    message: '',
    type: 'info',
    duration: 3000
  })

  const showAlert = (message, type = 'info', duration = 3000) => {
    setAlert({
      isOpen: true,
      message,
      type,
      duration
    })
  }

  const hideAlert = () => {
    setAlert(prev => ({ ...prev, isOpen: false }))
  }

  const showLoginAlert = (feature = 'this feature') => {
    showAlert(`Please login to use ${feature}`, 'login', 4000)
  }

  return {
    alert,
    showAlert,
    hideAlert,
    showLoginAlert
  }
}

