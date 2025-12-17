// Voice input (speech-to-text) utility

export const startVoiceInput = (onResult, onError) => {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    onError('Speech recognition not supported in this browser')
    return null
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new SpeechRecognition()
  
  recognition.continuous = false
  recognition.interimResults = true
  recognition.lang = 'en-US'

  recognition.onresult = (event) => {
    let interimTranscript = ''
    let finalTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' '
      } else {
        interimTranscript += transcript
      }
    }

    if (finalTranscript) {
      onResult(finalTranscript.trim())
    } else if (interimTranscript) {
      onResult(interimTranscript, true)
    }
  }

  recognition.onerror = (event) => {
    let errorMessage = 'Speech recognition error'
    switch(event.error) {
      case 'no-speech':
        errorMessage = 'No speech detected'
        break
      case 'audio-capture':
        errorMessage = 'No microphone found'
        break
      case 'not-allowed':
        errorMessage = 'Microphone permission denied'
        break
      default:
        errorMessage = `Error: ${event.error}`
    }
    onError(errorMessage)
  }

  recognition.onend = () => {
    // Auto-restart if needed
  }

  recognition.start()
  return recognition
}

export const stopVoiceInput = (recognition) => {
  if (recognition) {
    recognition.stop()
  }
}

export const isVoiceInputSupported = () => {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

