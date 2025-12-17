import { useState, useRef, useEffect } from 'react'
import MessageList from './MessageList'
import QuickActions from './QuickActions'
import InputArea from './InputArea'
import BuildLibrary from './BuildLibrary'
import BuildComparison from './BuildComparison'
import SearchBar from './SearchBar'
import InputDialog from './InputDialog'
import ConfirmDialog from './ConfirmDialog'
import Alert from './Alert'
import BuildAnalysisCard from './BuildAnalysisCard'
import SuggestedPrompts from './SuggestedPrompts'
import RecentConversations from './RecentConversations'
import { useAlert } from '../hooks/useAlert'
import { saveMessages, loadMessages, saveConversationHistory, saveBuild } from '../utils/storage'

function Chat({ apiBase, conversationHistory, setConversationHistory, autoPlayVoice, setAutoPlayVoice, currentGame, user }) {
  const { alert, showAlert, hideAlert, showLoginAlert } = useAlert()
  const [messages, setMessages] = useState(() => {
    const saved = loadMessages()
    if (saved && saved.length > 0) {
      // Ensure all messages have unique IDs
      return saved.map((msg, index) => ({
        ...msg,
        id: msg.id || `saved-${index}-${Date.now()}`,
        timestamp: new Date(msg.timestamp)
      }))
    }
    return [{
      id: `welcome-${Date.now()}`,
      text: "Yo. I'm Carl.\n\nI'm a gaming strategist. I don't sugarcoat. I don't hold back.\n\nAsk me about builds, strategies, meta, or any game. I'll give you the real talk.\n\nWhat game are we grinding?",
      role: 'bot',
      timestamp: new Date()
    }]
  })
  const [isTyping, setIsTyping] = useState(false)
  const [showBuildLibrary, setShowBuildLibrary] = useState(false)
  const [showBuildComparison, setShowBuildComparison] = useState(false)
  const [searchResults, setSearchResults] = useState(null)
  const [inputDialog, setInputDialog] = useState({ isOpen: false, type: null })
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, type: null, data: null })
  const [currentBuildAnalysis, setCurrentBuildAnalysis] = useState(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
    saveMessages(messages)
  }, [messages])

  useEffect(() => {
    saveConversationHistory(conversationHistory)
  }, [conversationHistory])

  const addMessage = (text, role, isError = false, useTypingAnimation = false) => {
    // Generate unique ID using timestamp + random number to avoid duplicates
    const newMessage = {
      id: Date.now() + Math.random(),
      text,
      role,
      isError,
      useTypingAnimation,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, newMessage])
    return newMessage.id
  }

  const sendMessage = async (messageText) => {
    if (!messageText.trim()) return

    let message = messageText.trim()

    // Check for command shortcuts
    if (message.startsWith('/build ')) {
      const buildDesc = message.replace('/build ', '').trim()
      await analyzeBuild(buildDesc, null)
      return
    }
    
    if (message.startsWith('/meta ')) {
      const game = message.replace('/meta ', '').trim()
      message = `What's the current meta for ${game}? What builds and strategies are dominating?`
    }
    
    if (message.startsWith('/tips ')) {
      const game = message.replace('/tips ', '').trim()
      message = `Give me pro tips for ${game}. What should I know?`
    }

    addMessage(message, 'user')
    setIsTyping(true)

    try {
      const headers = {
        'Content-Type': 'application/json'
      }
      // Get token from localStorage if user exists
      const token = localStorage.getItem('carl_token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: message,
          conversationHistory: conversationHistory,
          game_id: currentGame !== 'general' ? currentGame : null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many requests. Please wait a moment before sending another message.')
        }
        throw new Error(data.error || 'Failed to get response')
      }

      if (!data.response) {
        if (data.details) {
          throw new Error(`AI couldn't generate a response. ${data.details}`)
        }
        throw new Error('Server returned empty response. The AI model may have hit token limits. Please try again or use a shorter message.')
      }

      setIsTyping(false)
      
      // Add message with embeds if present
      const newMessage = {
        id: Date.now() + Math.random(),
        text: data.response,
        role: 'bot',
        isError: false,
        useTypingAnimation: true,
        timestamp: new Date(),
        embeds: data.embeds || null
      }
      setMessages(prev => [...prev, newMessage])

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: data.response }
      ])

      if (autoPlayVoice) {
        await playVoiceResponse(data.response)
      }
    } catch (error) {
      setIsTyping(false)
      addMessage(`⚠️ ${error.message}`, 'bot', true)
    }
  }

  const analyzeBuild = async (buildDescription, gameName) => {
    addMessage(`Analyzing build${gameName ? ` for ${gameName}` : ''}...`, 'user')
    setIsTyping(true)

    try {
      const response = await fetch(`${apiBase}/analyze-build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          buildDescription,
          gameName: gameName || null
        })
      })

      const data = await response.json()
      setIsTyping(false)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze build')
      }

      // Store build analysis data for card display
      const buildData = {
        buildDescription,
        gameName: data.gameName,
        analysis: data.analysis
      }
      setCurrentBuildAnalysis(buildData)

      // Also add as message for history
      const analysisText = `Build Analysis${data.gameName ? ` - ${data.gameName}` : ''}:\n\n${data.analysis}`
      addMessage(analysisText, 'bot', false, true)

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: `Analyze build: ${buildDescription}` },
        { role: 'assistant', content: data.analysis }
      ])
    } catch (error) {
      setIsTyping(false)
      addMessage(`⚠️ ${error.message}`, 'bot', true)
    }
  }

  const analyzeImage = async (file) => {
    addMessage(`📸 Analyzing screenshot: ${file.name}`, 'user')
    setIsTyping(true)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const headers = {}
      const token = localStorage.getItem('carl_token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${apiBase}/analyze-image`, {
        method: 'POST',
        headers,
        body: formData
      })

      const data = await response.json()
      setIsTyping(false)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze image')
      }

      addMessage(data.analysis, 'bot', false, true)

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: `[Image: ${file.name}]` },
        { role: 'assistant', content: data.analysis }
      ])
    } catch (error) {
      setIsTyping(false)
      addMessage(`⚠️ ${error.message}`, 'bot', true)
    }
  }

  const playVoiceResponse = async (text) => {
    try {
      const response = await fetch(`${apiBase}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      })

      if (!response.ok) {
        throw new Error('Failed to generate speech')
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      
      await audio.play()
      
      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl)
      })
    } catch (error) {
      console.error('Voice playback error:', error)
    }
  }

  const handleLoadBuild = (build) => {
    setShowBuildLibrary(false)
    analyzeBuild(build.description, build.gameName)
  }

  const handleQuickAction = async (action) => {
    switch(action) {
      case 'build-analysis':
        setInputDialog({
          isOpen: true,
          type: 'build-analysis',
          title: 'Build Analysis',
          label: 'Describe the build',
          placeholder: 'Items, abilities, stats, etc.',
          secondaryLabel: 'Game (optional)',
          secondaryPlaceholder: 'What game is this for?'
        })
        return
      case 'build-library':
        if (!user) {
          showLoginAlert('accessing the build library')
          return
        }
        setShowBuildLibrary(true)
        return
      case 'build-comparison':
        if (!user) {
          showLoginAlert('comparing builds')
          return
        }
        setShowBuildComparison(true)
        return
      case 'add-game':
        if (!user) {
          showLoginAlert('adding custom games')
          return
        }
        setInputDialog({
          isOpen: true,
          type: 'add-game',
          title: 'Add Custom Game',
          label: 'Game name',
          placeholder: 'Enter game name',
          secondaryLabel: 'Icon (emoji)',
          secondaryPlaceholder: '🎮'
        })
        return
      case 'meta-check':
        setInputDialog({
          isOpen: true,
          type: 'meta-check',
          title: 'Meta Check',
          label: 'What game?',
          placeholder: 'Enter game name'
        })
        return
      case 'strategy-help':
        sendMessage('I need help with a gaming strategy. What should I focus on?')
        return
      case 'game-tips':
        setInputDialog({
          isOpen: true,
          type: 'game-tips',
          title: 'Game Tips',
          label: 'What game?',
          placeholder: 'Enter game name'
        })
        return
    }
  }

  const handleDialogSubmit = async (input, secondaryInput) => {
    switch(inputDialog.type) {
      case 'build-analysis':
        await analyzeBuild(input, secondaryInput || null)
        break
      case 'meta-check':
        if (input) {
          sendMessage(`What's the current meta for ${input}? What builds, strategies, or characters are dominating right now?`)
        }
        break
      case 'game-tips':
        if (input) {
          sendMessage(`Give me pro tips for ${input}. What should I know?`)
        }
        break
      case 'add-game':
        if (input) {
          try {
            const token = localStorage.getItem('carl_token')
            const response = await fetch(`${apiBase}/games`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                name: input,
                icon: secondaryInput || '🎮',
                description: ''
              })
            })
            if (response.ok) {
              addMessage(`✅ Game "${input}" added successfully!`, 'bot', false, false)
            } else {
              const data = await response.json()
              addMessage(`⚠️ ${data.error}`, 'bot', true)
            }
          } catch (error) {
            addMessage(`⚠️ Failed to add game`, 'bot', true)
          }
        }
        break
    }
    setInputDialog({ isOpen: false, type: null })
  }

  const handleConfirmSaveBuild = () => {
    if (confirmDialog.data) {
      setInputDialog({
        isOpen: true,
        type: 'name-build',
        title: 'Name Build',
        label: 'Build name',
        placeholder: `Build ${new Date().toLocaleDateString()}`
      })
      setConfirmDialog({
        isOpen: false,
        type: 'name-build',
        data: confirmDialog.data
      })
    }
  }

  const handleSaveBuild = async (buildData) => {
    setInputDialog({
      isOpen: true,
      type: 'name-build',
      title: 'Name Build',
      label: 'Build name',
      placeholder: `Build ${new Date().toLocaleDateString()}`
    })
    setConfirmDialog({
      isOpen: false,
      type: 'name-build',
      data: buildData
    })
  }

  const handleNameBuildSubmit = (buildName, secondaryInput) => {
    const buildData = confirmDialog.data
    if (buildData && buildName) {
      saveBuild({
        name: buildName,
        description: buildData.buildDescription,
        gameName: buildData.gameName,
        analysis: buildData.analysis
      })
      addMessage('✅ Build saved to library!', 'bot', false, false)
      setCurrentBuildAnalysis(null) // Clear after saving
    }
    setInputDialog({ isOpen: false, type: null })
    setConfirmDialog({ isOpen: false, type: null, data: null })
  }

  const handleSharePost = async (messageText, messageId) => {
    if (!user) {
      addMessage('⚠️ Please login to share messages', 'bot', true)
      return
    }

    // Block initial greeting message
    const initialGreeting = "Yo. I'm Carl.\n\nI'm a gaming strategist. I don't sugarcoat. I don't hold back.\n\nAsk me about builds, strategies, meta, or any game. I'll give you the real talk.\n\nWhat game are we grinding?"
    if (messageText.includes(initialGreeting) || messageText.trim() === initialGreeting.trim()) {
      addMessage('⚠️ Cannot share the initial greeting message', 'bot', true)
      return
    }

    try {
      const token = localStorage.getItem('carl_token')
      const gameId = currentGame !== 'general' ? currentGame : null
      
      const response = await fetch(`${apiBase}/social`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: messageText,
          content_type: 'response',
          game_id: gameId
        })
      })

      if (response.ok) {
        addMessage('✅ Message shared to social feed!', 'bot', false, false)
      } else {
        const data = await response.json()
        addMessage(`⚠️ ${data.error || 'Failed to share message'}`, 'bot', true)
      }
    } catch (error) {
      addMessage('⚠️ Failed to share message', 'bot', true)
    }
  }

  const displayMessages = searchResults || messages

  return (
    <div className="chat-container">
      <div className="chat-layout">
        <div className="chat-main">
          <div className="chat-header-controls">
            <button 
              className="sidebar-toggle-btn"
              onClick={() => setShowSidebar(!showSidebar)}
              title="Toggle sidebar"
            >
              ☰
            </button>
            <SearchBar messages={messages} onSearchResult={setSearchResults} />
          </div>
          <MessageList 
            messages={displayMessages}
            isTyping={isTyping}
            apiBase={apiBase}
            autoPlayVoice={autoPlayVoice}
            highlightQuery={searchResults ? searchResults[0]?.text : null}
            onShare={user ? handleSharePost : null}
          />
          {currentBuildAnalysis && (
            <div className="build-analysis-wrapper">
              <BuildAnalysisCard 
                buildData={currentBuildAnalysis}
                onSave={handleSaveBuild}
                onShare={handleSharePost}
                user={user}
              />
            </div>
          )}
          <div ref={messagesEndRef} />
          <SuggestedPrompts onSelectPrompt={sendMessage} currentGame={currentGame} />
          <QuickActions onAction={handleQuickAction} user={user} />
          <InputArea 
            onSend={sendMessage}
            onImageUpload={analyzeImage}
            autoPlayVoice={autoPlayVoice}
            setAutoPlayVoice={setAutoPlayVoice}
            showAlert={showAlert}
          />
        </div>
        {showSidebar && (
          <RecentConversations 
            onClose={() => setShowSidebar(false)}
            onSelectConversation={(history) => {
              setConversationHistory(history)
              setShowSidebar(false)
            }}
            currentHistory={conversationHistory}
          />
        )}
      </div>
      {showBuildLibrary && (
        <BuildLibrary 
          onLoadBuild={handleLoadBuild}
          onClose={() => setShowBuildLibrary(false)}
        />
      )}

      {showBuildComparison && (
        <BuildComparison
          isOpen={showBuildComparison}
          onClose={() => setShowBuildComparison(false)}
        />
      )}
      <InputDialog
        isOpen={inputDialog.isOpen}
        onClose={() => {
          setInputDialog({ isOpen: false, type: null })
          if (inputDialog.type === 'name-build') {
            setConfirmDialog({ isOpen: false, type: null, data: null })
          }
        }}
        onSubmit={inputDialog.type === 'name-build' ? handleNameBuildSubmit : handleDialogSubmit}
        title={inputDialog.title}
        label={inputDialog.label}
        placeholder={inputDialog.placeholder}
        multiline={inputDialog.type === 'build-analysis'}
        secondaryLabel={inputDialog.secondaryLabel}
        secondaryPlaceholder={inputDialog.secondaryPlaceholder}
      />
      <ConfirmDialog
        isOpen={confirmDialog.isOpen && confirmDialog.type === 'save-build'}
        onClose={() => setConfirmDialog({ isOpen: false, type: null, data: null })}
        onConfirm={handleConfirmSaveBuild}
        title="Save Build"
        message="Save this build to your library?"
        confirmText="Save"
        cancelText="Cancel"
      />
      <ConfirmDialog
        isOpen={confirmDialog.isOpen && confirmDialog.type === 'name-build'}
        onClose={() => setConfirmDialog({ isOpen: false, type: null, data: null })}
        onConfirm={() => {}}
        title=""
        message=""
        confirmText=""
        cancelText=""
        hidden={true}
      />
      <Alert
        isOpen={alert.isOpen}
        message={alert.message}
        type={alert.type}
        onClose={hideAlert}
        duration={alert.duration}
      />
    </div>
  )
}

export default Chat

