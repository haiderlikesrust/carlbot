import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import io from 'socket.io-client'
import FriendsList from '../components/FriendsList'
import VoicePanel from '../components/VoicePanel'
import ServerSettingsModal from '../components/ServerSettingsModal'
import InviteModal from '../components/InviteModal'
import ProfileModal from '../components/ProfileModal'
import './DiscordPage.css'

// Rebranded as Carlcord

import { API_BASE, SOCKET_URL } from '../config.js'

function DiscordPage() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [servers, setServers] = useState([])
  const [selectedServer, setSelectedServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [typingUsers, setTypingUsers] = useState([])
  const [showReactionPicker, setShowReactionPicker] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiPickerTab, setEmojiPickerTab] = useState('standard')
  const [showThreads, setShowThreads] = useState(false)
  const [threads, setThreads] = useState([])
  const [selectedThread, setSelectedThread] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [friends, setFriends] = useState([])
  const [activityStatus, setActivityStatus] = useState('online')
  const [customStatus, setCustomStatus] = useState('')
  const [showFriends, setShowFriends] = useState(false)
  const [showServerModal, setShowServerModal] = useState(false)
  const [serverName, setServerName] = useState('')
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null)
  const [voiceChannelUsers, setVoiceChannelUsers] = useState({}) // channelId -> users array
  const [speakingUsers, setSpeakingUsers] = useState(new Set()) // Track speaking users across all channels
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [serverInvites, setServerInvites] = useState([])
  const [voicePanelMinimized, setVoicePanelMinimized] = useState(false)
  const [voicePanelPosition, setVoicePanelPosition] = useState({ x: window.innerWidth - 400, y: window.innerHeight - 300 })
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [showPinnedMessages, setShowPinnedMessages] = useState(false)
  const [customEmojis, setCustomEmojis] = useState([])
  const [roles, setRoles] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionPosition, setMentionPosition] = useState(null)
  const [mentionSuggestions, setMentionSuggestions] = useState([])
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const messagesEndRef = useRef(null)
  const messageInputRef = useRef(null)
  const socketRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const fileInputRef = useRef(null)
  const searchTimeoutRef = useRef(null)
  
  // Helper function to highlight search terms
  const highlightSearchTerms = (text, query) => {
    if (!text || !query) return text
    const terms = query.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0)
    let highlighted = text
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi')
      highlighted = highlighted.replace(regex, '<mark>$1</mark>')
    })
    return <span dangerouslySetInnerHTML={{ __html: highlighted }} />
  }

  // Helper function to render message content with custom emojis and mentions
  const renderMessageContent = (content, messageMentions = []) => {
    if (!content) return ''
    
    // Escape HTML first to prevent XSS
    let rendered = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
    
    // Replace @mentions with highlighted spans
    // Format: <@userId> or <@!userId>
    const mentionRegex = /&lt;@!?(\d+)&gt;/g
    rendered = rendered.replace(mentionRegex, (match, userId) => {
      // Try to find user in current server members or friends
      let username = 'Unknown User'
      if (selectedServer) {
        // Fetch user info if we have the mention data
        const mentionedUser = friends.find(f => f.friend_id === parseInt(userId))
        if (mentionedUser) {
          username = mentionedUser.friend_username || mentionedUser.friend_display_name
        }
      }
      return `<span class="message-mention" data-user-id="${userId}">@${username}</span>`
    })
    
    // Replace @role mentions
    const roleMentionRegex = /&lt;@&amp;(\d+)&gt;/g
    rendered = rendered.replace(roleMentionRegex, (match, roleId) => {
      const role = roles.find(r => r.id === parseInt(roleId))
      const roleName = role?.name || 'Unknown Role'
      return `<span class="message-mention role-mention">@${roleName}</span>`
    })
    
    // Replace @everyone
    rendered = rendered.replace(/@everyone/g, '<span class="message-mention everyone-mention">@everyone</span>')
    
    // Replace :emoji_name: with custom emoji images
    customEmojis.forEach(emoji => {
      const regex = new RegExp(`:${emoji.name}:`, 'g')
      const emojiHtml = `<img src="${emoji.url.replace(/"/g, '&quot;')}" alt=":${emoji.name}:" class="custom-emoji-inline" title=":${emoji.name}:">`
      rendered = rendered.replace(regex, emojiHtml)
    })
    
    // Convert newlines to <br>
    rendered = rendered.replace(/\n/g, '<br>')
    
    return rendered
  }

  const handlePinMessage = async (messageId) => {
    try {
      const response = await fetch(`${API_BASE}/discord-messages/${messageId}/pin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchMessages(selectedChannel.id)
        fetchPinnedMessages(selectedChannel.id)
      } else {
        const error = await response.json()
        console.error('Failed to pin message:', error)
      }
    } catch (error) {
      console.error('Error pinning message:', error)
    }
  }

  const handleUnpinMessage = async (messageId) => {
    try {
      const response = await fetch(`${API_BASE}/discord-messages/${messageId}/pin`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchMessages(selectedChannel.id)
        fetchPinnedMessages(selectedChannel.id)
      } else {
        const error = await response.json()
        console.error('Failed to unpin message:', error)
      }
    } catch (error) {
      console.error('Error unpinning message:', error)
    }
  }

  const fetchPinnedMessages = async (channelId) => {
    try {
      const response = await fetch(`${API_BASE}/discord-messages/channel/${channelId}/pinned`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setPinnedMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Failed to fetch pinned messages:', error)
    }
  }

  const handleReaction = async (messageId, emojiName) => {
    try {
      const response = await fetch(`${API_BASE}/reactions/${messageId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ emoji_name: emojiName })
      })

      if (response.ok) {
        // Socket will update the UI
      }
    } catch (error) {
      console.error('Reaction error:', error)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !selectedChannel) return

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('channel_id', selectedChannel.id)

      const response = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        // Create message with attachment
        const messageResponse = await fetch(`${API_BASE}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            channel_id: selectedChannel.id,
            content: `📎 ${file.name}`,
            attachments: JSON.stringify([data.attachment])
          })
        })

        // Socket event will handle adding the message
        if (messageResponse.ok) {
          // Message will be added via socket event
        }
      }
    } catch (error) {
      console.error('File upload error:', error)
      alert('Failed to upload file')
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        limit: '50'
      })
      
      if (selectedChannel?.id) {
        params.append('channel_id', selectedChannel.id)
      }
      if (selectedServer?.id) {
        params.append('server_id', selectedServer.id)
      }

      const response = await fetch(
        `${API_BASE}/discord-search/messages?${params.toString()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data)
      } else {
        const error = await response.json()
        console.error('Search error:', error)
        setSearchResults({ total: 0, messages: [] })
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults({ total: 0, messages: [] })
    }
  }

  const fetchThreads = async () => {
    if (!selectedChannel) return

    try {
      const response = await fetch(`${API_BASE}/threads/channel/${selectedChannel.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setThreads(data.threads || [])
      }
    } catch (error) {
      console.error('Fetch threads error:', error)
    }
  }

  useEffect(() => {
    if (selectedChannel && showThreads) {
      fetchThreads()
    }
  }, [selectedChannel, showThreads])

  const fetchFriends = async () => {
    try {
      const response = await fetch(`${API_BASE}/friends?status=accepted`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setFriends(data.friendships || [])
      }
    } catch (error) {
      console.error('Failed to fetch friends:', error)
    }
  }

  const fetchActivityStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/activity/status/${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.activity_status) {
          setActivityStatus(data.activity_status.status || 'online')
          setCustomStatus(data.activity_status.custom_status || '')
        }
      }
    } catch (error) {
      console.error('Failed to fetch activity status:', error)
    }
  }

  const updateActivityStatus = async (status) => {
    try {
      await fetch(`${API_BASE}/activity/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status,
          custom_status: customStatus
        })
      })
    } catch (error) {
      console.error('Failed to update activity status:', error)
    }
  }

  useEffect(() => {
    if (token) {
      fetchServers()
      fetchFriends()
      fetchActivityStatus()
      updateActivityStatus('online')
    }
  }, [token])

  // Handle server selection from URL (after servers load)
  useEffect(() => {
    if (servers.length > 0) {
      const params = new URLSearchParams(window.location.search)
      const serverId = params.get('server')
      if (serverId) {
        const server = servers.find(s => s.id === parseInt(serverId))
        if (server && (!selectedServer || selectedServer.id !== server.id)) {
          setSelectedServer(server)
          // Clean up URL
          window.history.replaceState({}, '', '/carlcord')
        }
      }
    }
  }, [servers, selectedServer])

  useEffect(() => {
    // Update activity status periodically
    if (token) {
      const interval = setInterval(() => {
        updateActivityStatus(activityStatus)
      }, 30000) // Every 30 seconds

      return () => clearInterval(interval)
    }
  }, [token, activityStatus])

  useEffect(() => {
    if (selectedServer) {
      fetchChannels(selectedServer.id)
    }
  }, [selectedServer])

  useEffect(() => {
    if (selectedChannel) {
      fetchPinnedMessages(selectedChannel.id)
    }
  }, [selectedChannel])

  useEffect(() => {
    if (selectedServer && token) {
      fetchCustomEmojis(selectedServer.id)
      fetchRoles(selectedServer.id)
      fetchServerMembers(selectedServer.id)
    }
  }, [selectedServer, token])

  const [serverMembers, setServerMembers] = useState([])

  const fetchServerMembers = async (serverId) => {
    try {
      const response = await fetch(`${API_BASE}/servers/${serverId}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setServerMembers(data.members || [])
      }
    } catch (error) {
      console.error('Failed to fetch server members:', error)
    }
  }

  const fetchRoles = async (serverId) => {
    try {
      const response = await fetch(`${API_BASE}/roles/server/${serverId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setRoles(data.roles || [])
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    }
  }

  useEffect(() => {
    if (token) {
      fetchNotifications()
      fetchUnreadCount()
      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadCount()
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [token])

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_BASE}/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setNotifications(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch(`${API_BASE}/notifications/unread`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.count || 0)
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error)
    }
  }

  const markNotificationRead = async (notificationId) => {
    try {
      const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchNotifications()
        fetchUnreadCount()
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllRead = async () => {
    try {
      const response = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchNotifications()
        fetchUnreadCount()
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const fetchCustomEmojis = async (serverId) => {
    try {
      const response = await fetch(`${API_BASE}/emojis/server/${serverId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setCustomEmojis(data.emojis || [])
      }
    } catch (error) {
      console.error('Failed to fetch custom emojis:', error)
    }
  }

  // Periodically update voice channel users
  useEffect(() => {
    if (!selectedServer || channels.length === 0) return
    
    const updateVoiceUsers = () => {
      channels
        .filter(c => ['voice', 'video'].includes(c.type))
        .forEach(channel => {
          fetchVoiceChannelUsers(channel.id)
        })
    }

    updateVoiceUsers() // Initial fetch
    const interval = setInterval(updateVoiceUsers, 3000)
    return () => clearInterval(interval)
  }, [selectedServer, channels])

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel.id)
      // Scroll to bottom when messages load
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [selectedChannel])

  // Socket.io setup
  useEffect(() => {
    if (!token || !user) return

    // Connect to socket
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token }
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      socket.emit('authenticate', token)
      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
    })

    socketRef.current = socket

    // Join channel when selected
    if (selectedChannel) {
      socket.emit('join_channel', selectedChannel.id)
    }

    // Listen for voice state updates
    socket.on('voice_state_update', (data) => {
      if (data.channel_id) {
        // Fetch users for this channel
        fetchVoiceChannelUsers(data.channel_id)
      } else if (data.action === 'leave') {
        // User left, update all channels
        Object.keys(voiceChannelUsers).forEach(channelId => {
          fetchVoiceChannelUsers(parseInt(channelId))
        })
        
        // If current user left, close the voice panel
        if (data.user_id === user.id && activeVoiceChannel) {
          setActiveVoiceChannel(null)
        }
      }
      
      // Update speaking users if provided
      if (data.speaking !== undefined) {
        setSpeakingUsers(prev => {
          const next = new Set(prev)
          if (data.speaking) {
            next.add(data.user_id)
          } else {
            next.delete(data.user_id)
          }
          return next
        })
      }
    })

    // Listen for new messages
    socket.on('message_create', (message) => {
      if (message.channel_id === selectedChannel?.id) {
        // Check if message already exists to prevent duplicates
        setMessages(prev => {
          const exists = prev.some(m => m.id === message.id)
          if (exists) return prev
          return [...prev, message]
        })
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    })

    // Listen for message updates
    socket.on('message_update', (message) => {
      if (message.channel_id === selectedChannel?.id) {
        setMessages(prev => prev.map(m => m.id === message.id ? message : m))
      }
    })

    // Listen for message deletions
    socket.on('message_delete', ({ messageId }) => {
      if (selectedChannel) {
        setMessages(prev => prev.filter(m => m.id !== messageId))
      }
    })

    // Listen for notifications
    socket.on('notification', (notification) => {
      setNotifications(prev => [notification, ...prev])
      setUnreadCount(prev => prev + 1)
      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Mentioned by ${notification.actor_username}`, {
          body: notification.content || 'You were mentioned',
          icon: notification.actor_avatar_url || '/favicon.ico'
        })
      }
    })

    // Listen for reactions
    socket.on('reaction_add', ({ messageId, reaction }) => {
      if (selectedChannel) {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            const reactions = m.reactions || []
            return { ...m, reactions: [...reactions, reaction] }
          }
          return m
        }))
      }
    })

    socket.on('reaction_remove', ({ messageId, emoji_name }) => {
      if (selectedChannel) {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            const reactions = (m.reactions || []).filter(r => r.emoji_name !== emoji_name)
            return { ...m, reactions }
          }
          return m
        }))
      }
    })

    // Listen for typing indicators
    socket.on('user_typing', ({ userId, channelId }) => {
      if (channelId === selectedChannel?.id && userId !== user.id) {
        setTypingUsers(prev => {
          if (!prev.includes(userId)) {
            return [...prev, userId]
          }
          return prev
        })
      }
    })

    socket.on('user_stopped_typing', ({ userId, channelId }) => {
      if (channelId === selectedChannel?.id) {
        setTypingUsers(prev => prev.filter(id => id !== userId))
      }
    })

    return () => {
      if (socketRef.current && socketRef.current.connected) {
        try {
          if (selectedChannel) {
            socketRef.current.emit('leave_channel', selectedChannel.id)
          }
          socketRef.current.disconnect()
        } catch (error) {
          console.warn('Error disconnecting socket in DiscordPage:', error)
        }
      }
    }
  }, [token, user, selectedChannel])

  // Typing indicator
  useEffect(() => {
    if (!socketRef.current || !selectedChannel || !messageInput) return

    socketRef.current.emit('typing_start', { channelId: selectedChannel.id })

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 3 seconds of no input
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing_stop', { channelId: selectedChannel.id })
    }, 3000)

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [messageInput, selectedChannel])

  const fetchServers = async () => {
    try {
      const response = await fetch(`${API_BASE}/servers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setServers(data.servers || [])
        if (data.servers && data.servers.length > 0 && !selectedServer) {
          setSelectedServer(data.servers[0])
        }
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchChannels = async (serverId) => {
    try {
      const response = await fetch(`${API_BASE}/channels/server/${serverId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        const allChannels = [...(data.channels || []), ...Object.values(data.categories || {}).flat()]
        setChannels(allChannels)
        if (allChannels.length > 0 && !selectedChannel) {
          setSelectedChannel(allChannels.find(c => c.type === 'text') || allChannels[0])
        }
        
        // Fetch voice users for all voice channels
        allChannels
          .filter(c => ['voice', 'video'].includes(c.type))
          .forEach(channel => {
            fetchVoiceChannelUsers(channel.id)
          })
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    }
  }

  const fetchVoiceChannelUsers = async (channelId) => {
    try {
      const response = await fetch(`${API_BASE}/voice/channel/${channelId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setVoiceChannelUsers(prev => ({
          ...prev,
          [channelId]: data.voice_states || []
        }))
      }
    } catch (error) {
      console.error('Failed to fetch voice channel users:', error)
    }
  }

  // Fetch voice users when channels change
  useEffect(() => {
    if (channels.length > 0 && token) {
      channels
        .filter(c => ['voice', 'video'].includes(c.type))
        .forEach(channel => {
          fetchVoiceChannelUsers(channel.id)
        })
    }
  }, [channels, token])

  const fetchMessages = async (channelId) => {
    try {
      const response = await fetch(`${API_BASE}/discord-messages/channel/${channelId}?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  // Handle mention autocomplete
  const handleMessageInputChange = (e) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart
    
    setMessageInput(value)
    
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
    
    // Check if we're in a mention context
    const textBeforeCursor = value.substring(0, cursorPos)
    // Match @ followed by word characters (letters, numbers, underscore) or nothing
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/)
    
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase()
      setMentionQuery(query)
      setMentionPosition(cursorPos - query.length - 1) // Position of @
      
      // Filter suggestions
      const suggestions = []
      
      // Add @everyone if query is empty or matches
      if (query === '' || 'everyone'.includes(query)) {
        suggestions.push({
          type: 'everyone',
          id: 'everyone',
          name: 'everyone'
        })
      }
      
      // Add users
      const matchingUsers = serverMembers.filter(member => {
        const username = (member.username || '').toLowerCase()
        const displayName = (member.display_name || '').toLowerCase()
        return username.includes(query) || displayName.includes(query)
      }).slice(0, 10).map(member => ({
        type: 'user',
        id: member.user_id,
        name: member.display_name || member.username,
        username: member.username,
        avatar: member.avatar_url
      }))
      
      suggestions.push(...matchingUsers)
      
      // Add roles
      const matchingRoles = roles.filter(role => {
        const roleName = (role.name || '').toLowerCase()
        return roleName.includes(query)
      }).slice(0, 5).map(role => ({
        type: 'role',
        id: role.id,
        name: role.name,
        color: role.color
      }))
      
      suggestions.push(...matchingRoles)
      
      setMentionSuggestions(suggestions)
      setSelectedMentionIndex(0)
    } else {
      setMentionQuery('')
      setMentionPosition(null)
      setMentionSuggestions([])
    }
  }

  const insertMention = (suggestion) => {
    if (mentionPosition === null && mentionPosition !== 0) return
    
    const textBefore = messageInput.substring(0, mentionPosition)
    const textAfter = messageInput.substring(mentionPosition + 1 + mentionQuery.length)
    
    let mentionText = ''
    if (suggestion.type === 'user') {
      mentionText = `<@${suggestion.id}>`
    } else if (suggestion.type === 'role') {
      mentionText = `<@&${suggestion.id}>`
    } else if (suggestion.type === 'everyone') {
      mentionText = '@everyone'
    }
    
    const newText = textBefore + mentionText + ' ' + textAfter
    setMessageInput(newText)
    setMentionQuery('')
    setMentionPosition(null)
    setMentionSuggestions([])
    
    // Focus back on input and set cursor position
    setTimeout(() => {
      if (messageInputRef.current) {
        const newCursorPos = mentionPosition + mentionText.length + 1
        messageInputRef.current.focus()
        messageInputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        // Auto-resize
        messageInputRef.current.style.height = 'auto'
        messageInputRef.current.style.height = Math.min(messageInputRef.current.scrollHeight, 200) + 'px'
      }
    }, 0)
  }

  const handleMessageInputKeyDown = (e) => {
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex(prev => 
          prev < mentionSuggestions.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionSuggestions[selectedMentionIndex])
      } else if (e.key === 'Escape') {
        setMentionQuery('')
        setMentionPosition(null)
        setMentionSuggestions([])
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(e)
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!messageInput.trim() || !selectedChannel) return

    // Close mention autocomplete if open
    setMentionQuery('')
    setMentionPosition(null)
    setMentionSuggestions([])

    try {
      const response = await fetch(`${API_BASE}/discord-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          channel_id: selectedChannel.id,
          content: messageInput
        })
      })

      if (response.ok) {
        // Don't manually add message - socket event will handle it
        setMessageInput('')
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Send message error:', error)
      alert('Failed to send message')
    }
  }

  const createServer = () => {
    setShowServerModal(true)
    setServerName('')
  }

  const handleCreateServer = async (e) => {
    e.preventDefault()
    if (!serverName.trim()) return

    try {
      const response = await fetch(`${API_BASE}/servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: serverName.trim(), description: 'A new server' })
      })

      if (response.ok) {
        const data = await response.json()
        await fetchServers()
        setSelectedServer(data.server)
        setShowServerModal(false)
        setServerName('')
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create server')
      }
    } catch (error) {
      console.error('Create server error:', error)
      alert('Failed to create server')
    }
  }

  if (loading) {
    return <div className="carlcord-loading">Loading Carlcord...</div>
  }

  if (!user) {
    return <div className="carlcord-auth-required">Please log in to use Carlcord features</div>
  }

  return (
    <>
      <div 
        className="carlcord-container"
      >
      {/* Server Sidebar */}
      <div className="carlcord-servers-sidebar">
        <button className="carlcord-server-icon add-server" onClick={createServer} title="Create Server">
          +
        </button>
        {servers.map(server => (
          <button
            key={server.id}
            className={`carlcord-server-icon ${selectedServer?.id === server.id ? 'active' : ''}`}
            onClick={() => setSelectedServer(server)}
            title={server.name}
          >
            {server.icon || server.name.charAt(0).toUpperCase()}
          </button>
        ))}
      </div>

      {/* Channels Sidebar */}
      {selectedServer ? (
        <div className="carlcord-channels-sidebar">
          <div className="carlcord-server-header">
            <h2>{selectedServer.name}</h2>
          </div>
          <div className="server-members-section">
            <div className="members-header">MEMBERS — {selectedServer.member_count ? selectedServer.member_count : 0}</div>
            <div className="members-list">
              {friends && friends.length > 0 ? friends.slice(0, 10).map(friend => (
                <div key={friend.friend_user_id} className="member-item">
                  <div className="member-avatar-wrapper">
                    <img
                      src={friend.friend_avatar || `https://ui-avatars.com/api/?name=${friend.friend_username}`}
                      alt={friend.friend_username}
                      className="member-avatar"
                    />
                    <span className={`status-indicator ${friend.friend_status || 'offline'}`}></span>
                  </div>
                  <span className="member-name">{friend.friend_display_name || friend.friend_username}</span>
                  {friend.friend_game ? (
                    <span className="member-game">🎮 {friend.friend_game}</span>
                  ) : null}
                </div>
              )) : null}
            </div>
          </div>
          <div className="carlcord-channels-list">
            <div className="channel-category">
              <div className="category-header">TEXT CHANNELS</div>
              {channels
                .filter(c => c.type === 'text')
                .map(channel => (
                  <div
                    key={channel.id}
                    className={`channel-item ${selectedChannel?.id === channel.id ? 'active' : ''}`}
                    onClick={() => setSelectedChannel(channel)}
                  >
                    <span className="channel-icon">#</span>
                    {channel.name}
                  </div>
                ))}
            </div>
            <div className="channel-category">
              <div className="category-header">VOICE CHANNELS</div>
              {channels
                .filter(c => c.type === 'voice' || c.type === 'video')
                .map(channel => {
                  const channelUsers = voiceChannelUsers[channel.id] || []
                  const userCount = channelUsers.length
                  return (
                    <div key={channel.id}>
                      <div
                        className={`channel-item ${activeVoiceChannel?.id === channel.id ? 'active' : ''} voice-channel ${userCount > 0 ? 'has-users' : ''}`}
                        onClick={() => {
                          if (['voice', 'video'].includes(channel.type)) {
                            setActiveVoiceChannel(channel)
                          }
                        }}
                      >
                        <span className="channel-icon">{channel.type === 'video' ? '📹' : '🔊'}</span>
                        <span className="channel-name">{channel.name}</span>
                        {userCount > 0 && (
                          <span className="channel-user-count">{userCount}</span>
                        )}
                      </div>
                      {/* Show users in voice channel */}
                      {userCount > 0 && channelUsers && channelUsers.length > 0 ? (
                        <div className="voice-channel-users">
                          {channelUsers.map(userState => {
                            const isSpeaking = speakingUsers.has(userState.user_id)
                            return (
                              <div
                                key={userState.user_id}
                                className={`voice-channel-user-item ${isSpeaking ? 'speaking' : ''} ${userState.self_mute ? 'muted' : ''}`}
                              >
                                <div className="voice-user-avatar-mini">
                                  <img
                                    src={userState.avatar_url || `https://ui-avatars.com/api/?name=${userState.username}`}
                                    alt={userState.username}
                                    onError={(e) => {
                                      e.target.src = `https://ui-avatars.com/api/?name=${userState.username}`
                                    }}
                                  />
                                  <span className={`status-indicator ${userState.user_status || 'offline'}`}></span>
                                  {userState.self_mute ? <span className="voice-mini-mute">🔇</span> : null}
                                  {isSpeaking ? <div className="voice-mini-glow"></div> : null}
                                </div>
                                <span className="voice-user-name-mini">{userState.display_name || userState.username}</span>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      ) : (
        <div className={`carlcord-channels-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="carlcord-welcome">
            <h2>Welcome to Carlcord!</h2>
            <p>Create or select a server to get started</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {selectedChannel ? (
        <div className="carlcord-main-content">
          {/* Channel Header */}
          <div className="carlcord-channel-header">
            <span className="channel-hash">#</span>
            <h3>{selectedChannel.name}</h3>
            {selectedChannel.topic && (
              <span className="channel-topic">{selectedChannel.topic}</span>
            )}
            {pinnedMessages.length > 0 && (
              <button
                className="header-action-btn pinned-btn"
                onClick={() => setShowPinnedMessages(!showPinnedMessages)}
                title="Pinned Messages"
              >
                📌 {pinnedMessages.length}
              </button>
            )}
            <div className="channel-header-actions">
              <button 
                className="header-action-btn"
                onClick={() => setShowThreads(!showThreads)}
                title="Threads"
              >
                💬
              </button>
              <button 
                className={`header-action-btn ${showSearchBar ? 'active' : ''}`}
                onClick={() => {
                  setShowSearchBar(!showSearchBar)
                  if (!showSearchBar) {
                    // Focus search input when opening
                    setTimeout(() => {
                      const searchInput = document.querySelector('.search-input')
                      if (searchInput) searchInput.focus()
                    }, 100)
                  } else {
                    setSearchQuery('')
                    setSearchResults(null)
                  }
                }}
                title={showSearchBar ? "Hide Search" : "Search Messages"}
              >
                🔍
              </button>
              <button 
                className="header-action-btn notification-btn"
                onClick={() => setShowNotifications(!showNotifications)}
                title="Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
              <button 
                className="header-action-btn"
                onClick={() => setShowFriends(!showFriends)}
                title="Friends"
              >
                👥
              </button>
              {selectedServer && (
                <>
                  <button 
                    className="header-action-btn"
                    onClick={() => setShowInviteModal(true)}
                    title="Invite People"
                  >
                    ➕
                  </button>
                  {(selectedServer.owner_id === user?.id || user?.role === 'admin') && (
                    <button 
                      className="header-action-btn"
                      onClick={() => navigate(`/carlcord/server/${selectedServer.id}/settings`)}
                      title="Server Settings"
                    >
                      ⚙️
                    </button>
                  )}
                </>
              )}
              <button 
                className="header-action-btn"
                onClick={() => setShowProfileModal(true)}
                title="Edit Profile - Customize your display name, bio, and profile settings"
              >
                👤
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {showSearchBar && (
            <div className={`carlcord-search-bar ${searchQuery !== '' ? 'active' : ''}`}>
              <div className="search-input-wrapper">
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    if (e.target.value.trim()) {
                      // Debounce search
                      clearTimeout(searchTimeoutRef.current)
                      searchTimeoutRef.current = setTimeout(() => {
                        handleSearch()
                      }, 300)
                    } else {
                      setSearchResults(null)
                    }
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="search-input"
                  autoFocus
                />
                {searchQuery && (
                  <button 
                    className="search-clear-btn"
                    onClick={() => {
                      setSearchQuery('')
                      setSearchResults(null)
                    }}
                    title="Clear"
                  >
                    ×
                  </button>
                )}
                <button onClick={handleSearch} className="search-btn" title="Search">🔍</button>
                <button 
                  onClick={() => {
                    setShowSearchBar(false)
                    setSearchQuery('')
                    setSearchResults(null)
                  }}
                  className="search-close-btn"
                  title="Close Search"
                >
                  ×
                </button>
              </div>
            {searchResults && searchResults.total > 0 && (
              <div className="search-results">
                <div className="search-results-header">
                  <span>Found {searchResults.total} result{searchResults.total !== 1 ? 's' : ''}</span>
                  {selectedChannel && (
                    <span className="search-scope">in #{selectedChannel.name}</span>
                  )}
                </div>
                <div className="search-results-list">
                  {searchResults.messages.map(msg => (
                    <div 
                      key={msg.id} 
                      className="search-result-item"
                      onClick={() => {
                        // Scroll to message
                        const messageElement = document.querySelector(`[data-message-id="${msg.id}"]`)
                        if (messageElement) {
                          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          messageElement.style.background = 'rgba(0, 255, 65, 0.2)'
                          setTimeout(() => {
                            messageElement.style.background = ''
                          }, 2000)
                        }
                        setSearchQuery('')
                        setSearchResults(null)
                      }}
                    >
                      <div className="result-header">
                        <img 
                          src={msg.avatar_url || `https://ui-avatars.com/api/?name=${msg.username}`}
                          alt={msg.username}
                          className="result-avatar"
                        />
                        <span className="result-author">{msg.display_name || msg.username}</span>
                        <span className="result-time">{new Date(msg.created_at).toLocaleDateString()}</span>
                        {msg.channel_name && (
                          <span className="result-channel">#{msg.channel_name}</span>
                        )}
                      </div>
                      <div className="result-content">
                        {highlightSearchTerms(msg.content, searchQuery)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {searchResults && searchResults.total === 0 && (
              <div className="search-results-empty">
                No messages found matching "{searchQuery}"
              </div>
            )}
            </div>
          )}

          {/* Notifications Panel */}
          {showNotifications && (
            <div className="notifications-panel">
              <div className="notifications-header">
                <h3>Notifications</h3>
                <div className="notifications-header-actions">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="mark-all-read-btn">
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setShowNotifications(false)} className="close-notifications-btn">
                    ×
                  </button>
                </div>
              </div>
              <div className="notifications-list">
                {notifications.length === 0 ? (
                  <div className="no-notifications">No notifications</div>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                      onClick={() => {
                        if (!notif.is_read) {
                          markNotificationRead(notif.id)
                        }
                        // Navigate to the notification source
                        if (notif.message_id && notif.channel_id) {
                          navigate(`/carlcord?server=${notif.server_id}&channel=${notif.channel_id}`)
                          setShowNotifications(false)
                        }
                      }}
                    >
                      <div className="notification-icon">
                        {notif.type === 'mention' ? '🔔' : '📢'}
                      </div>
                      <div className="notification-content">
                        <div className="notification-text">
                          {notif.type === 'mention' && (
                            <span>
                              <strong>{notif.actor_username}</strong> mentioned you
                              {notif.is_everyone && ' (@everyone)'}
                            </span>
                          )}
                          {notif.content && (
                            <div className="notification-preview">{notif.content}</div>
                          )}
                        </div>
                        <div className="notification-time">
                          {new Date(notif.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Threads Sidebar */}
          {showThreads && (
            <div className="carlcord-threads-sidebar">
              <div className="threads-header">
                <h4>Threads</h4>
                <button onClick={() => setShowThreads(false)}>×</button>
              </div>
              <div className="threads-list">
                {threads.map(thread => (
                  <div
                    key={thread.id}
                    className={`thread-item ${selectedThread?.id === thread.id ? 'active' : ''}`}
                    onClick={() => setSelectedThread(thread)}
                  >
                    <span className="thread-icon">💬</span>
                    {thread.name}
                    <span className="thread-count">{thread.message_count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pinned Messages Sidebar */}
          {showPinnedMessages && pinnedMessages.length > 0 && (
            <div className="pinned-messages-sidebar">
              <div className="pinned-header">
                <h4>📌 Pinned Messages</h4>
                <button onClick={() => setShowPinnedMessages(false)}>×</button>
              </div>
              <div className="pinned-list">
                {pinnedMessages.map(message => (
                  <div key={message.id} className="pinned-message-item" onClick={() => {
                    // Scroll to message in main area
                    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`)
                    if (messageElement) {
                      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      messageElement.style.background = 'rgba(0, 255, 65, 0.2)'
                      setTimeout(() => {
                        messageElement.style.background = ''
                      }, 2000)
                    }
                  }}>
                    <div className="pinned-author">{message.display_name || message.username}</div>
                    <div className="pinned-content">{message.content?.substring(0, 100)}{message.content?.length > 100 ? '...' : ''}</div>
                    <div className="pinned-time">{new Date(message.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="carlcord-messages-area">
            {messages && messages.length > 0 ? messages.map((message, index) => {
              const prevMessage = index > 0 ? messages[index - 1] : null
              const isGrouped = prevMessage && 
                prevMessage.user_id === message.user_id && 
                (new Date(message.created_at) - new Date(prevMessage.created_at)) < 300000 // 5 minutes
              const showAvatar = !isGrouped
              const showHeader = !isGrouped
              
              return (
                <div 
                  key={message.id} 
                  className={`carlcord-message ${isGrouped ? 'grouped' : ''}`} 
                  data-message-id={message.id}
                >
                  {message.is_pinned && (
                    <div className="message-pinned-badge">📌 Pinned</div>
                  )}
                  {showAvatar && (
                    <div className="message-avatar-wrapper">
                      <img
                        src={message.avatar_url || `https://ui-avatars.com/api/?name=${message.username}`}
                        alt={message.username}
                        className="message-avatar"
                        onError={(e) => {
                          e.target.src = `https://ui-avatars.com/api/?name=${message.username}`
                        }}
                      />
                      <span className={`status-indicator ${message.user_status || 'offline'}`}></span>
                    </div>
                  )}
                  <div className="message-content">
                    {showHeader && (
                      <div className="message-header">
                        <span className="message-author">{message.display_name || message.username}</span>
                        <span className="message-timestamp" title={new Date(message.created_at).toLocaleString()}>
                          {new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {message.edited_at && (
                          <span className="message-edited">(edited)</span>
                        )}
                      </div>
                    )}
                    <div className="message-text" dangerouslySetInnerHTML={{ __html: renderMessageContent(message.content || '', message.mentions) }} />
                    {message.embeds && (() => {
                      try {
                        const embeds = typeof message.embeds === 'string' ? JSON.parse(message.embeds) : message.embeds
                        return Array.isArray(embeds) ? embeds.map((embed, idx) => (
                          <div key={idx} className="message-embed">
                            {embed.title && <div className="embed-title">{embed.title}</div>}
                            {embed.description && <div className="embed-description">{embed.description}</div>}
                            {embed.image && <img src={embed.image.url} alt="Embed" className="embed-image" />}
                          </div>
                        )) : null
                      } catch (e) {
                        return null
                      }
                    })()}
                    {message.attachments && (() => {
                      try {
                        const attachments = typeof message.attachments === 'string' ? JSON.parse(message.attachments) : message.attachments
                        return Array.isArray(attachments) ? attachments.map((att, idx) => (
                          <div key={idx} className="message-attachment">
                            {att.content_type?.startsWith('image/') ? (
                              <img src={`${API_BASE.replace('/api', '')}${att.url}`} alt={att.filename} className="attachment-image" />
                            ) : (
                              <a href={`${API_BASE.replace('/api', '')}${att.url}`} download className="attachment-link">
                                📎 {att.filename} ({(att.size / 1024).toFixed(1)} KB)
                              </a>
                            )}
                          </div>
                        )) : null
                      } catch (e) {
                        return null
                      }
                    })()}
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="message-reactions">
                        {message.reactions.map((reaction, idx) => (
                          <span 
                            key={idx} 
                            className={`reaction ${reaction.me ? 'me' : ''}`}
                            onClick={() => handleReaction(message.id, reaction.emoji_name)}
                          >
                            {reaction.emoji_name} {reaction.count}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="message-actions">
                      <button 
                        className="reaction-btn"
                        onClick={() => setShowReactionPicker(message.id)}
                        title="Add Reaction"
                      >
                        😀
                      </button>
                      {(selectedServer?.owner_id === user?.id || user?.role === 'admin') && (
                        <button
                          className="pin-btn"
                          onClick={() => message.is_pinned ? handleUnpinMessage(message.id) : handlePinMessage(message.id)}
                          title={message.is_pinned ? 'Unpin Message' : 'Pin Message'}
                        >
                          {message.is_pinned ? '📌' : '📍'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }) : null}
            <div ref={messagesEndRef} />
            {typingUsers.length > 0 && (
              <div className="typing-indicator">
                {typingUsers.length} user{typingUsers.length > 1 ? 's' : ''} typing...
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="carlcord-message-input-container">
            <form className="carlcord-message-input-wrapper" onSubmit={sendMessage}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <div className="message-input-wrapper">
                <textarea
                  ref={messageInputRef}
                  className="carlcord-message-input"
                  placeholder={`Message #${selectedChannel.name}`}
                  value={messageInput}
                  onChange={handleMessageInputChange}
                  onKeyDown={handleMessageInputKeyDown}
                  onBlur={(e) => {
                    // Delay closing to allow click on suggestion
                    setTimeout(() => {
                      if (document.activeElement !== e.target && 
                          !document.querySelector('.mention-autocomplete:hover')) {
                        setMentionQuery('')
                        setMentionPosition(null)
                        setMentionSuggestions([])
                      }
                    }, 200)
                  }}
                  rows={1}
                  style={{ resize: 'none', overflow: 'hidden' }}
                />
                {mentionSuggestions.length > 0 && (
                  <div className="mention-autocomplete">
                    <div className="mention-autocomplete-header">
                      <span>Mention</span>
                    </div>
                    <div className="mention-suggestions-list">
                      {mentionSuggestions.map((suggestion, index) => (
                        <div
                          key={`${suggestion.type}-${suggestion.id}`}
                          className={`mention-suggestion ${index === selectedMentionIndex ? 'selected' : ''}`}
                          onClick={() => insertMention(suggestion)}
                          onMouseEnter={() => setSelectedMentionIndex(index)}
                        >
                          {suggestion.type === 'user' && (
                            <>
                              <img
                                src={suggestion.avatar || `https://ui-avatars.com/api/?name=${suggestion.username}`}
                                alt={suggestion.name}
                                className="mention-avatar"
                                onError={(e) => {
                                  e.target.src = `https://ui-avatars.com/api/?name=${suggestion.username}`
                                }}
                              />
                              <div className="mention-info">
                                <span className="mention-name">{suggestion.name}</span>
                                <span className="mention-username">{suggestion.username}</span>
                              </div>
                            </>
                          )}
                          {suggestion.type === 'role' && (
                            <>
                              <div 
                                className="mention-role-indicator"
                                style={{ backgroundColor: suggestion.color || '#00ff41' }}
                              ></div>
                              <div className="mention-info">
                                <span className="mention-name">{suggestion.name}</span>
                                <span className="mention-type">Role</span>
                              </div>
                            </>
                          )}
                          {suggestion.type === 'everyone' && (
                            <>
                              <div className="mention-everyone-indicator">@</div>
                              <div className="mention-info">
                                <span className="mention-name">everyone</span>
                                <span className="mention-type">Notify all members</span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="input-actions-row">
                <button
                  type="button"
                  className="input-action-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload File"
                >
                  📎
                </button>
                <button
                  type="button"
                  className="input-action-btn"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  title="Emoji"
                >
                  😀
                </button>
              </div>
              <button 
                type="submit" 
                className="carlcord-send-btn"
                disabled={!messageInput.trim()}
              >
                Send
              </button>
            </form>
          </div>
          {showEmojiPicker && (
            <div className="emoji-picker">
              <div className="emoji-picker-header">
                <span>Emoji Picker</span>
                <button onClick={() => setShowEmojiPicker(false)}>×</button>
              </div>
              <div className="emoji-picker-tabs">
                <button 
                  className={`emoji-tab ${emojiPickerTab === 'standard' ? 'active' : ''}`}
                  onClick={() => setEmojiPickerTab('standard')}
                >
                  Standard
                </button>
                {customEmojis.length > 0 && (
                  <button 
                    className={`emoji-tab ${emojiPickerTab === 'custom' ? 'active' : ''}`}
                    onClick={() => setEmojiPickerTab('custom')}
                  >
                    Custom ({customEmojis.length})
                  </button>
                )}
              </div>
              {emojiPickerTab === 'standard' && (
                <div className="emoji-grid">
                  {['😀', '😂', '🥰', '😎', '🤔', '👍', '❤️', '🔥', '💯', '🎉', '🚀', '⭐', '😊', '😍', '🤣', '😭', '😱', '😡', '🤮', '🤢', '💪', '👏', '🙏', '🎮', '🎯', '🏆', '💎', '⚡', '🌟', '✨'].map(emoji => (
                    <button
                      key={emoji}
                      className="emoji-item"
                      onClick={() => {
                        setMessageInput(prev => prev + emoji)
                        setShowEmojiPicker(false)
                      }}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              {emojiPickerTab === 'custom' && customEmojis.length > 0 && (
                <div className="emoji-grid">
                  {customEmojis.map(emoji => (
                    <button
                      key={emoji.id}
                      className="emoji-item custom-emoji"
                      onClick={() => {
                        setMessageInput(prev => prev + `:${emoji.name}:`)
                        setShowEmojiPicker(false)
                      }}
                      title={emoji.name}
                    >
                      <img src={emoji.url} alt={emoji.name} className="custom-emoji-img" />
                    </button>
                  ))}
                </div>
              )}
              {emojiPickerTab === 'custom' && customEmojis.length === 0 && (
                <div className="emoji-picker-empty">
                  No custom emojis in this server
                </div>
              )}
            </div>
          )}
        </div>
      ) : selectedServer ? (
        <div className="carlcord-main-content">
          <div className="carlcord-welcome">
            <h2>Welcome to {selectedServer.name}!</h2>
            <p>Select a channel to start chatting</p>
          </div>
        </div>
      ) : (
        <div className="carlcord-main-content">
          <div className="carlcord-welcome">
            <h2>Welcome to Carlcord!</h2>
            <p>Create or select a server to get started</p>
          </div>
        </div>
      )}

      {/* Friends Sidebar */}
      {showFriends && (
        <FriendsList 
          onSelectFriend={(friend) => {
            // Could open DM with friend
            console.log('Selected friend:', friend)
          }}
        />
      )}

      {/* Server Creation Modal */}
      <ServerModal
        show={showServerModal}
        onClose={() => {
          setShowServerModal(false)
          setServerName('')
        }}
        onSubmit={handleCreateServer}
        serverName={serverName}
        setServerName={setServerName}
      />
      </div>

      {/* Voice/Video Channel Panel - Floating Draggable - Rendered outside container */}
      {activeVoiceChannel && selectedServer && (
        <VoicePanel
          channel={activeVoiceChannel}
          server={selectedServer}
          onClose={() => {
            setActiveVoiceChannel(null)
            setVoicePanelMinimized(false)
          }}
          minimized={voicePanelMinimized}
          onMinimize={() => setVoicePanelMinimized(!voicePanelMinimized)}
          position={voicePanelPosition}
          onPositionChange={(newPos) => {
            // Constrain position to viewport
            const constrainedPos = {
              x: Math.max(0, Math.min(newPos.x, window.innerWidth - 420)),
              y: Math.max(0, Math.min(newPos.y, window.innerHeight - 200))
            }
            setVoicePanelPosition(constrainedPos)
          }}
        />
      )}

      {/* Server Settings Modal */}
      {showServerSettings && selectedServer && (
        <ServerSettingsModal
          server={selectedServer}
          onClose={() => setShowServerSettings(false)}
          onUpdate={(updatedServer) => {
            setServers(servers.map(s => s.id === updatedServer.id ? updatedServer : s))
            setSelectedServer(updatedServer)
          }}
        />
      )}

      {/* Invite Modal */}
      {showInviteModal && selectedServer && (
        <InviteModal
          server={selectedServer}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Profile Modal */}
      {showProfileModal && user && (
        <ProfileModal
          isOpen={true}
          user={user}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </>
  )
}

// Server Creation Modal Component (rendered via portal)
function ServerModal({ show, onClose, onSubmit, serverName, setServerName }) {
  if (!show) return null

  return createPortal(
    <div className="carlcord-modal-overlay" onClick={onClose}>
      <div className="carlcord-modal" onClick={(e) => e.stopPropagation()}>
        <div className="carlcord-modal-header">
          <h3>Create Server</h3>
          <button 
            className="modal-close-btn"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="carlcord-modal-body" onSubmit={onSubmit}>
          <label>
            Server Name
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Enter server name"
              className="carlcord-modal-input"
              autoFocus
              maxLength={100}
            />
          </label>
          <div className="carlcord-modal-actions">
            <button
              type="button"
              className="carlcord-modal-btn cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="carlcord-modal-btn primary"
              disabled={!serverName.trim()}
            >
              Create Server
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default DiscordPage
