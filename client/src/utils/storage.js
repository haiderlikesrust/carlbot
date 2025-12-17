// LocalStorage utilities for persistence

export const saveMessages = (messages) => {
  try {
    localStorage.setItem('carl_messages', JSON.stringify(messages))
  } catch (error) {
    console.error('Failed to save messages:', error)
  }
}

export const loadMessages = () => {
  try {
    const saved = localStorage.getItem('carl_messages')
    return saved ? JSON.parse(saved) : null
  } catch (error) {
    console.error('Failed to load messages:', error)
    return null
  }
}

export const saveConversationHistory = (history) => {
  try {
    localStorage.setItem('carl_conversation_history', JSON.stringify(history))
  } catch (error) {
    console.error('Failed to save conversation history:', error)
  }
}

export const loadConversationHistory = () => {
  try {
    const saved = localStorage.getItem('carl_conversation_history')
    return saved ? JSON.parse(saved) : []
  } catch (error) {
    console.error('Failed to load conversation history:', error)
    return []
  }
}

export const saveBuild = (build) => {
  try {
    const builds = getSavedBuilds()
    builds.push({
      ...build,
      id: Date.now(),
      savedAt: new Date().toISOString()
    })
    localStorage.setItem('carl_saved_builds', JSON.stringify(builds))
    return true
  } catch (error) {
    console.error('Failed to save build:', error)
    return false
  }
}

export const getSavedBuilds = () => {
  try {
    const saved = localStorage.getItem('carl_saved_builds')
    return saved ? JSON.parse(saved) : []
  } catch (error) {
    console.error('Failed to load builds:', error)
    return []
  }
}

export const deleteBuild = (buildId) => {
  try {
    const builds = getSavedBuilds()
    const filtered = builds.filter(b => b.id !== buildId)
    localStorage.setItem('carl_saved_builds', JSON.stringify(filtered))
    return true
  } catch (error) {
    console.error('Failed to delete build:', error)
    return false
  }
}

export const clearAllData = () => {
  try {
    localStorage.removeItem('carl_messages')
    localStorage.removeItem('carl_conversation_history')
    localStorage.removeItem('carl_saved_builds')
    return true
  } catch (error) {
    console.error('Failed to clear data:', error)
    return false
  }
}

