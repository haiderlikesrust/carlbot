import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import io from 'socket.io-client'
import './VoicePanel.css'

import { API_BASE, SOCKET_URL } from '../config.js'

function VoicePanel({ channel, server, onClose, minimized = false, onMinimize, position, onPositionChange }) {
  const { user, token } = useAuth()
  const [voiceStates, setVoiceStates] = useState([])
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(channel?.type === 'video')
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [speakingUsers, setSpeakingUsers] = useState(new Set())
  const [currentUserState, setCurrentUserState] = useState(null)
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedMic, setSelectedMic] = useState(null)
  const [selectedSpeaker, setSelectedSpeaker] = useState(null)
  const [showAudioSettings, setShowAudioSettings] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false)
  const [isTestingVoice, setIsTestingVoice] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [activityStatus, setActivityStatus] = useState('online')
  const panelRef = useRef(null)
  
  const localVideoRef = useRef(null)
  const remoteVideosRef = useRef({})
  const remoteAudiosRef = useRef({}) // For voice-only channels
  const peersRef = useRef({})
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const socketRef = useRef(null)
  const audioContextRef = useRef(null)
  const analysersRef = useRef({})
  const localAnalyserRef = useRef(null)
  const micLevelIntervalRef = useRef(null)
  
  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  useEffect(() => {
    if (!channel || !token || !server) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token }
    })

    socket.on('connect', () => {
      socket.emit('authenticate', token)
      socket.emit('join_voice_channel', channel.id)
      socket.emit('join_server', server.id)
    })

    socketRef.current = socket
    
    // Wait for socket to be connected before joining
    socket.on('connect', () => {
      // Small delay to ensure socket is ready
      setTimeout(() => {
        joinVoiceChannel()
      }, 200)
    })
    
    // If already connected, join immediately
    if (socket.connected) {
      setTimeout(() => {
        joinVoiceChannel()
      }, 200)
    }

    socket.on('voice_state_update', (data) => {
      if (data.channel_id === channel.id || data.channel_id === null) {
        fetchVoiceStates()
      }
    })

    socket.on('webrtc_offer', async (data) => {
      if (data.channelId === channel.id && data.fromUserId !== user.id) {
        await handleOffer(data.fromUserId, data.offer)
      }
    })

    socket.on('webrtc_answer', async (data) => {
      if (data.channelId === channel.id && data.fromUserId !== user.id) {
        await handleAnswer(data.fromUserId, data.answer)
      }
    })

    socket.on('webrtc_ice_candidate', async (data) => {
      if (data.channelId === channel.id && data.fromUserId !== user.id) {
        await handleIceCandidate(data.fromUserId, data.candidate)
      }
    })

    return () => {
      // Cleanup function - synchronous only, no async operations
      try {
        // Stop all media tracks immediately
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
        }
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop())
          screenStreamRef.current = null
        }

        // Close peer connections
        Object.values(peersRef.current).forEach(pc => {
          try {
            pc.close()
          } catch (e) {
            // Ignore errors during cleanup
          }
        })
        peersRef.current = {}
        analysersRef.current = {}
        localAnalyserRef.current = null

        // Stop mic level interval
        if (micLevelIntervalRef.current) {
          clearInterval(micLevelIntervalRef.current)
          micLevelIntervalRef.current = null
        }

        // Close AudioContext if it exists and is not already closed
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            // Don't await - just start closing
            audioContextRef.current.close().catch(() => {
              // Ignore errors - context might already be closing
            })
          } catch (e) {
            // Ignore sync errors
          }
        }

        // Disconnect socket if connected
        if (socket && socket.connected) {
          try {
            socket.emit('leave_voice_channel', channel.id)
            socket.disconnect()
          } catch (e) {
            // Ignore errors
          }
        }

        // Try to leave voice channel via API (fire and forget - don't await)
        if (token) {
          fetch(`${API_BASE}/voice/leave`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => {
            // Silently fail - component is unmounting
          })
        }
      } catch (error) {
        // Ignore all cleanup errors
        console.warn('Cleanup error (ignored):', error)
      }
    }
  }, [channel, token, server])

  useEffect(() => {
    if (channel && channel.id) {
      fetchVoiceStates()
      const interval = setInterval(fetchVoiceStates, 2000)
      return () => clearInterval(interval)
    }
  }, [channel?.id])

  // Fetch user's activity status
  useEffect(() => {
    if (user?.id && token) {
      fetch(`${API_BASE}/activity/status/${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.activity_status?.status) {
            setActivityStatus(data.activity_status.status)
          }
        })
        .catch(() => {})
    }
  }, [user?.id, token])

  // Voice activity detection for remote users
  useEffect(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch (e) {
        console.warn('Failed to create AudioContext:', e)
        return
      }
    }

    const detectVoiceActivity = () => {
      // Check if AudioContext is still valid
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        return
      }

      Object.entries(peersRef.current).forEach(([userId, pc]) => {
        const receiver = pc.getReceivers().find(r => r.track && r.track.kind === 'audio')
        if (receiver && receiver.track) {
          if (!analysersRef.current[userId]) {
            try {
              if (audioContextRef.current.state === 'closed') {
                return
              }
              const source = audioContextRef.current.createMediaStreamSource(
                new MediaStream([receiver.track])
              )
              const analyser = audioContextRef.current.createAnalyser()
              analyser.fftSize = 256
              analyser.smoothingTimeConstant = 0.8
              source.connect(analyser)
              analysersRef.current[userId] = analyser
            } catch (e) {
              console.warn('Failed to create analyser for user:', userId, e)
            }
          }

          const analyser = analysersRef.current[userId]
          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(dataArray)
          
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          const isSpeaking = average > 25 // Threshold

          setSpeakingUsers(prev => {
            const next = new Set(prev)
            if (isSpeaking) {
              next.add(parseInt(userId))
            } else {
              next.delete(parseInt(userId))
            }
            return next
          })
        }
      })
    }

    const interval = setInterval(detectVoiceActivity, 50)
    return () => clearInterval(interval)
  }, [voiceStates])

  // Local voice activity detection
  useEffect(() => {
    if (!localStreamRef.current) return

    // Ensure AudioContext exists and is not closed
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch (e) {
        console.warn('Failed to create AudioContext for local detection:', e)
        return
      }
    }

    if (!localAnalyserRef.current && audioContextRef.current.state !== 'closed') {
      try {
        const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current)
        const analyser = audioContextRef.current.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        source.connect(analyser)
        localAnalyserRef.current = analyser
      } catch (e) {
        console.warn('Failed to create local analyser:', e)
        return
      }
    }

    const detectLocalVoice = () => {
      if (!localAnalyserRef.current || isMuted || !audioContextRef.current || audioContextRef.current.state === 'closed') {
        setIsLocalSpeaking(false)
        setMicLevel(0)
        return
      }

      const dataArray = new Uint8Array(localAnalyserRef.current.frequencyBinCount)
      localAnalyserRef.current.getByteFrequencyData(dataArray)
      
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
      const level = Math.min(100, (average / 255) * 100)
      
      setMicLevel(level)
      setIsLocalSpeaking(average > 25)
    }

    micLevelIntervalRef.current = setInterval(detectLocalVoice, 50)
    return () => {
      if (micLevelIntervalRef.current) {
        clearInterval(micLevelIntervalRef.current)
      }
    }
  }, [localStreamRef.current, isMuted])

  const fetchVoiceStates = async () => {
    try {
      const response = await fetch(`${API_BASE}/voice/channel/${channel.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setVoiceStates(data.voice_states || [])
        const currentState = data.voice_states?.find(s => s.user_id === user.id)
        setCurrentUserState(currentState)
        
        if (data.voice_states) {
          data.voice_states.forEach(state => {
            if (state.user_id !== user.id && !peersRef.current[state.user_id]) {
              createPeerConnection(state.user_id)
            }
          })
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to fetch voice states:', response.status, errorData)
      }
    } catch (error) {
      console.error('Failed to fetch voice states:', error)
    }
  }

  const joinVoiceChannel = async () => {
    try {
      const response = await fetch(`${API_BASE}/voice/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          channel_id: channel.id,
          server_id: server.id
        })
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentUserState(data.voice_state)
        setIsMuted(data.voice_state?.self_mute || false)
        setIsDeafened(data.voice_state?.self_deaf || false)
        setIsVideoEnabled(data.voice_state?.self_video || channel.type === 'video')
        await startLocalMedia()
        fetchVoiceStates()
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to join voice channel:', response.status, errorData)
        alert(errorData.error || 'Failed to join voice channel')
      }
    } catch (error) {
      console.error('Failed to join voice channel:', error)
      alert('Failed to join voice channel. Please try again.')
    }
  }

  const leaveVoiceChannel = async () => {
    try {
      // Stop all media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
        screenStreamRef.current = null
      }

      // Close peer connections
      Object.values(peersRef.current).forEach(pc => {
        try {
          pc.close()
        } catch (e) {
          console.warn('Error closing peer connection:', e)
        }
      })
      peersRef.current = {}
      analysersRef.current = {}
      localAnalyserRef.current = null

      // Stop mic level interval
      if (micLevelIntervalRef.current) {
        clearInterval(micLevelIntervalRef.current)
        micLevelIntervalRef.current = null
      }

      // Close AudioContext if not already closed
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          await audioContextRef.current.close()
        } catch (e) {
          console.warn('Error closing AudioContext:', e)
        }
      }

      // Disconnect socket if connected
      if (socketRef.current && socketRef.current.connected) {
        try {
          socketRef.current.emit('leave_voice_channel', channel.id)
          socketRef.current.disconnect()
        } catch (e) {
          console.warn('Error disconnecting socket:', e)
        }
      }

      // Leave via API
      const response = await fetch(`${API_BASE}/voice/leave`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.warn('Leave API returned non-OK status:', response.status, errorData)
      }
      
      // Call onClose to hide the panel
      if (onClose) {
        onClose()
      }
    } catch (error) {
      console.error('Failed to leave voice channel:', error)
      // Still call onClose even if API call fails
      if (onClose) {
        onClose()
      }
    }
  }

  const startLocalMedia = async () => {
    try {
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      }

      if (selectedMic) {
        audioConstraints.deviceId = { exact: selectedMic }
      }

      const constraints = {
        audio: audioConstraints,
        video: channel.type === 'video' ? {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } : false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream

      // Apply audio output device if selected
      if (selectedSpeaker && localVideoRef.current) {
        try {
          await localVideoRef.current.setSinkId(selectedSpeaker)
        } catch (e) {
          console.warn('Could not set audio output:', e)
        }
      }

      if (localVideoRef.current && channel.type === 'video') {
        localVideoRef.current.srcObject = stream
      }

      Object.values(peersRef.current).forEach(pc => {
        stream.getTracks().forEach(track => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === track.kind)
          if (sender) {
            sender.replaceTrack(track)
          } else {
            pc.addTrack(track, stream)
          }
        })
      })

      // Initialize local analyser for speaking detection
      if (audioContextRef.current && audioContextRef.current.state !== 'closed' && !localAnalyserRef.current) {
        try {
          const source = audioContextRef.current.createMediaStreamSource(stream)
          const analyser = audioContextRef.current.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.8
          source.connect(analyser)
          localAnalyserRef.current = analyser
        } catch (e) {
          console.warn('Failed to create local analyser in startLocalMedia:', e)
        }
      }
    } catch (error) {
      console.error('Failed to get user media:', error)
      alert('Failed to access microphone. Please check permissions.')
    }
  }

  const changeAudioDevice = async (deviceId, type) => {
    if (type === 'input') {
      setSelectedMic(deviceId)
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0]
        if (audioTrack) {
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: deviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          })
          const newTrack = newStream.getAudioTracks()[0]
          audioTrack.stop()
          localStreamRef.current.removeTrack(audioTrack)
          localStreamRef.current.addTrack(newTrack)
          
          // Update all peer connections
          Object.values(peersRef.current).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio')
            if (sender) {
              sender.replaceTrack(newTrack)
            }
          })
        }
      }
    } else if (type === 'output') {
      setSelectedSpeaker(deviceId)
      // Update all audio elements with new speaker
      if (localVideoRef.current) {
        try {
          await localVideoRef.current.setSinkId(deviceId)
        } catch (e) {
          console.warn('Could not set local video audio output:', e)
        }
      }
      if (testAudioElementRef.current) {
        try {
          await testAudioElementRef.current.setSinkId(deviceId)
        } catch (e) {
          console.warn('Could not set test audio output:', e)
        }
      }
      // Update all remote audio elements
      Object.values(remoteAudiosRef.current).forEach(audio => {
        if (audio) {
          audio.setSinkId(deviceId).catch(e => {
            console.warn('Could not set remote audio output:', e)
          })
        }
      })
    }
  }

  const createPeerConnection = (targetUserId) => {
    const pc = new RTCPeerConnection(pcConfig)
    peersRef.current[targetUserId] = pc

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0]
      const audioTrack = stream.getAudioTracks()[0]
      const videoTrack = stream.getVideoTracks()[0]
      
      // Handle video if available
      if (videoTrack) {
        const remoteVideo = remoteVideosRef.current[targetUserId]
        if (remoteVideo) {
          remoteVideo.srcObject = stream
        }
      }
      
      // Handle audio - create audio element if it doesn't exist
      if (audioTrack) {
        let remoteAudio = remoteAudiosRef.current[targetUserId]
        if (!remoteAudio) {
          remoteAudio = document.createElement('audio')
          remoteAudio.autoplay = true
          remoteAudio.playsInline = true
          remoteAudio.muted = false
          document.body.appendChild(remoteAudio)
          remoteAudiosRef.current[targetUserId] = remoteAudio
          
          // Apply selected speaker if available
          if (selectedSpeaker) {
            remoteAudio.setSinkId(selectedSpeaker).catch(e => {
              console.warn('Could not set remote audio output:', e)
            })
          }
        }
        remoteAudio.srcObject = stream
        remoteAudio.play().catch(e => {
          console.warn('Could not play remote audio:', e)
        })
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc_ice_candidate', {
          targetUserId,
          candidate: event.candidate,
          channelId: channel.id
        })
      }
    }

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        if (socketRef.current) {
          socketRef.current.emit('webrtc_offer', {
            targetUserId,
            offer: pc.localDescription,
            channelId: channel.id
          })
        }
      })
      .catch(error => console.error('Error creating offer:', error))

    return pc
  }

  const handleOffer = async (fromUserId, offer) => {
    let pc = peersRef.current[fromUserId]
    if (!pc) {
      pc = new RTCPeerConnection(pcConfig)
      peersRef.current[fromUserId] = pc

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current)
        })
      }

      pc.ontrack = (event) => {
        const stream = event.streams[0]
        const audioTrack = stream.getAudioTracks()[0]
        const videoTrack = stream.getVideoTracks()[0]
        
        // Handle video if available
        if (videoTrack) {
          const remoteVideo = remoteVideosRef.current[fromUserId]
          if (remoteVideo) {
            remoteVideo.srcObject = stream
          }
        }
        
        // Handle audio - create audio element if it doesn't exist
        if (audioTrack) {
          let remoteAudio = remoteAudiosRef.current[fromUserId]
          if (!remoteAudio) {
            remoteAudio = document.createElement('audio')
            remoteAudio.autoplay = true
            remoteAudio.playsInline = true
            remoteAudio.muted = false
            document.body.appendChild(remoteAudio)
            remoteAudiosRef.current[fromUserId] = remoteAudio
            
            // Apply selected speaker if available
            if (selectedSpeaker) {
              remoteAudio.setSinkId(selectedSpeaker).catch(e => {
                console.warn('Could not set remote audio output:', e)
              })
            }
          }
          remoteAudio.srcObject = stream
          remoteAudio.play().catch(e => {
            console.warn('Could not play remote audio:', e)
          })
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('webrtc_ice_candidate', {
            targetUserId: fromUserId,
            candidate: event.candidate,
            channelId: channel.id
          })
        }
      }
    }

    // Check connection state before setting remote description
    if (pc.signalingState === 'closed' || pc.connectionState === 'closed') {
      console.warn('Peer connection is closed, cannot handle offer')
      return
    }
    
    // Only set remote description if in stable or have-local-offer state
    if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        if (socketRef.current?.connected) {
          socketRef.current.emit('webrtc_answer', {
            targetUserId: fromUserId,
            answer: pc.localDescription,
            channelId: channel.id
          })
        }
      } catch (error) {
        console.error('Error handling offer:', error)
      }
    } else {
      console.warn('Cannot handle offer in signaling state:', pc.signalingState)
    }
  }

  const handleAnswer = async (fromUserId, answer) => {
    try {
      const pc = peersRef.current[fromUserId]
      if (!pc) {
        console.warn('No peer connection for user:', fromUserId)
        return
      }
      
      // Check connection state before setting remote description
      if (pc.signalingState === 'closed' || pc.connectionState === 'closed') {
        console.warn('Peer connection is closed, cannot handle answer')
        return
      }
      
      // Only set remote description if in have-local-offer state
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } else {
        console.warn('Cannot handle answer in signaling state:', pc.signalingState)
      }
    } catch (error) {
      console.error('Error handling answer:', error)
    }
  }

  const handleIceCandidate = async (fromUserId, candidate) => {
    const pc = peersRef.current[fromUserId]
    if (pc && candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  const toggleMute = async () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted
      })
    }

    await fetch(`${API_BASE}/voice/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ self_mute: newMuted })
    })
  }

  const toggleDeafen = async () => {
    const newDeafened = !isDeafened
    setIsDeafened(newDeafened)
    
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = newDeafened ? false : !isMuted
      })
    }

    await fetch(`${API_BASE}/voice/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ self_deaf: newDeafened })
    })
  }

  const toggleVideo = async () => {
    const newVideoEnabled = !isVideoEnabled
    setIsVideoEnabled(newVideoEnabled)

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = newVideoEnabled
      })
    }

    await fetch(`${API_BASE}/voice/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ self_video: newVideoEnabled })
    })
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
        screenStreamRef.current = null
      }
      setIsScreenSharing(false)
      if (isVideoEnabled) {
        await startLocalMedia()
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })
        
        screenStreamRef.current = stream
        
        Object.values(peersRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => 
            s.track && s.track.kind === 'video'
          )
          if (sender && stream.getVideoTracks()[0]) {
            sender.replaceTrack(stream.getVideoTracks()[0])
          }
        })

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        setIsScreenSharing(true)

        stream.getVideoTracks()[0].onended = () => {
          toggleScreenShare()
        }
      } catch (error) {
        console.error('Failed to start screen share:', error)
      }
    }
  }

  // Voice test function - separate from actual VC stream
  const testVoiceRef = useRef(null)
  const testAnalyserRef = useRef(null)
  const testIntervalRef = useRef(null)
  const testAudioElementRef = useRef(null)
  
  const testVoice = async () => {
    if (isTestingVoice) {
      // Stop testing
      if (testVoiceRef.current) {
        testVoiceRef.current.getTracks().forEach(track => track.stop())
        testVoiceRef.current = null
      }
      if (testIntervalRef.current) {
        clearInterval(testIntervalRef.current)
        testIntervalRef.current = null
      }
      if (testAnalyserRef.current) {
        testAnalyserRef.current = null
      }
      if (testAudioElementRef.current) {
        testAudioElementRef.current.srcObject = null
        testAudioElementRef.current = null
      }
      setMicLevel(0)
      setIsLocalSpeaking(false)
      setIsTestingVoice(false)
      return
    }

    try {
      setIsTestingVoice(true)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      testVoiceRef.current = stream
      
      // Play audio back so user can hear themselves
      if (testAudioElementRef.current) {
        testAudioElementRef.current.srcObject = stream
        testAudioElementRef.current.play().catch(e => {
          console.warn('Could not play test audio:', e)
        })
        
        // Apply selected speaker if available
        if (selectedSpeaker) {
          testAudioElementRef.current.setSinkId(selectedSpeaker).catch(e => {
            console.warn('Could not set test audio output:', e)
          })
        }
      }
      
      // Create analyser for visual feedback
      const testAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = testAudioContext.createMediaStreamSource(stream)
      const analyser = testAudioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      testAnalyserRef.current = analyser
      
      testIntervalRef.current = setInterval(() => {
        if (!isTestingVoice || !testAnalyserRef.current) {
          if (testIntervalRef.current) {
            clearInterval(testIntervalRef.current)
            testIntervalRef.current = null
          }
          return
        }
        try {
          const dataArray = new Uint8Array(testAnalyserRef.current.frequencyBinCount)
          testAnalyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          const level = Math.min(100, (average / 255) * 100)
          setMicLevel(level)
          setIsLocalSpeaking(average > 25)
        } catch (err) {
          console.error('Error reading audio data:', err)
          if (testIntervalRef.current) {
            clearInterval(testIntervalRef.current)
            testIntervalRef.current = null
          }
        }
      }, 50)
    } catch (error) {
      console.error('Failed to test voice:', error)
      alert('Failed to access microphone. Please check permissions.')
      setIsTestingVoice(false)
    }
  }
  
  // Cleanup test stream on unmount
  useEffect(() => {
    return () => {
      if (testVoiceRef.current) {
        testVoiceRef.current.getTracks().forEach(track => track.stop())
      }
      if (testIntervalRef.current) {
        clearInterval(testIntervalRef.current)
      }
    }
  }, [])

  // Drag handlers - only on drag handle
  const handleMouseDown = (e) => {
    // Only allow dragging from the drag handle
    if (!e.target.closest('.voice-panel-drag-handle')) {
      return
    }
    e.preventDefault()
    setIsDragging(true)
    const rect = panelRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      if (onPositionChange) {
        onPositionChange({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, onPositionChange])

  const otherUsers = voiceStates.filter(s => s.user_id !== user.id)

  // Early return if missing required props
  if (!channel || !server || !user) {
    return null
  }

  // Don't render if channel is not a voice/video channel
  if (!['voice', 'video'].includes(channel.type)) {
    return null
  }

  const panelStyle = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 1500,
    cursor: isDragging ? 'grabbing' : 'grab'
  }

  return (
    <div 
      ref={panelRef}
      className={`voice-panel-overlay ${minimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`}
      style={panelStyle}
    >
      {/* Window Controls */}
      <div className="voice-panel-window-controls">
        {onMinimize && (
          <button
            className="voice-window-btn"
            onClick={onMinimize}
            title={minimized ? 'Maximize' : 'Minimize'}
          >
            {minimized ? '□' : '—'}
          </button>
        )}
        <button
          className="voice-window-btn close"
          onClick={onClose}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Drag Handle */}
      <div 
        className="voice-panel-drag-handle"
        onMouseDown={handleMouseDown}
      />

      <div className="voice-panel-container">
        {/* Left: User Info */}
        <div className="voice-panel-user-info">
          <div className="voice-user-avatar-compact">
            <img
              src={currentUserState?.avatar_url || user?.avatar_url || `https://ui-avatars.com/api/?name=${user?.username}`}
              alt={user?.username}
              className="voice-avatar-circle"
              onError={(e) => {
                e.target.src = `https://ui-avatars.com/api/?name=${user?.username}`
              }}
            />
            {!isMuted && !isDeafened && (
              <span className={`status-indicator ${currentUserState?.user_status || activityStatus || 'online'}`}></span>
            )}
            {isMuted && <div className="voice-status-overlay mute">🔇</div>}
            {isDeafened && <div className="voice-status-overlay deaf">🔊</div>}
            {(speakingUsers.has(user.id) || isLocalSpeaking) && !isMuted && <div className="voice-speaking-glow"></div>}
          </div>
          <div className="voice-user-details">
            <div className="voice-username">{currentUserState?.display_name || user?.username}</div>
            <div className="voice-channel-info">
              <span className="voice-channel-name">{channel.name}</span>
              <span className="voice-separator">/</span>
              <span className="voice-server-name">{server.name}</span>
            </div>
          </div>
        </div>

        {/* Center: Controls */}
        <div className="voice-panel-controls">
          <div className="voice-control-group">
            <button
              className={`voice-control-btn ${isMuted ? 'active' : ''} ${isLocalSpeaking ? 'speaking' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            {isLocalSpeaking && !isMuted && (
              <div className="mic-level-indicator">
                <div className="mic-level-bar" style={{ width: `${micLevel}%` }}></div>
              </div>
            )}
          </div>
          <button
            className={`voice-control-btn ${isDeafened ? 'active' : ''}`}
            onClick={toggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? '🔊' : '🔊'}
          </button>
          {channel.type === 'video' && (
            <>
              <button
                className={`voice-control-btn ${!isVideoEnabled ? 'active' : ''}`}
                onClick={toggleVideo}
                title={isVideoEnabled ? 'Disable Video' : 'Enable Video'}
              >
                📹
              </button>
              <button
                className={`voice-control-btn ${isScreenSharing ? 'active' : ''}`}
                onClick={toggleScreenShare}
                title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              >
                🖥️
              </button>
            </>
          )}
          <button
            className={`voice-control-btn test ${isTestingVoice ? 'active' : ''}`}
            onClick={testVoice}
            title={isTestingVoice ? 'Stop Voice Test' : 'Test Voice'}
          >
            🎙️
          </button>
          <button
            className="voice-control-btn settings"
            onClick={() => setShowAudioSettings(!showAudioSettings)}
            title="Audio Settings"
          >
            ⚙️
          </button>
          <div className="voice-activity-indicator">
            {(isLocalSpeaking || speakingUsers.has(user.id)) && !isMuted && <div className="voice-waveform"></div>}
          </div>
          <button
            className="voice-control-btn leave"
            onClick={leaveVoiceChannel}
            title="Disconnect"
          >
            📞
          </button>
        </div>

        {/* Audio Settings Dropdown */}
        {showAudioSettings && (
          <div className="voice-audio-settings">
            <div className="audio-settings-header">
              <h4>Audio Settings</h4>
              <button onClick={() => setShowAudioSettings(false)}>×</button>
            </div>
            <div className="audio-settings-content">
              <div className="audio-setting-group">
                <label>Microphone</label>
                <select
                  value={selectedMic || ''}
                  onChange={(e) => changeAudioDevice(e.target.value, 'input')}
                  className="audio-device-select"
                >
                  {audioDevices.inputs?.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                {micLevel > 0 && (
                  <div className="mic-level-display">
                    <div className="mic-level-bar-full">
                      <div 
                        className="mic-level-bar-fill" 
                        style={{ width: `${micLevel}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="audio-setting-group">
                <label>Speaker/Headphones</label>
                <select
                  value={selectedSpeaker || ''}
                  onChange={(e) => changeAudioDevice(e.target.value, 'output')}
                  className="audio-device-select"
                >
                  {audioDevices.outputs?.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Right: Participants Count */}
        <div className="voice-panel-participants">
          <div className="voice-participants-count">
            {voiceStates.length} {voiceStates.length === 1 ? 'user' : 'users'}
          </div>
          <div className="voice-participants-avatars">
            {otherUsers && otherUsers.length > 0 ? otherUsers.slice(0, 4).map(state => {
              const isSpeaking = speakingUsers.has(state.user_id)
              const isMutedState = state.self_mute || state.self_deaf
              return (
                <div
                  key={state.user_id}
                className={`voice-participant-avatar ${isMutedState ? 'muted' : ''} ${isSpeaking ? 'speaking' : ''}`}
                title={`${state.display_name || state.username}${isSpeaking ? ' (Speaking)' : ''}${isMutedState ? ' (Muted)' : ''}`}
              >
                {channel.type === 'video' && state.self_video && remoteVideosRef.current[state.user_id] ? (
                  <video
                    ref={el => { if (el) remoteVideosRef.current[state.user_id] = el }}
                    autoPlay
                    playsInline
                    muted={false}
                    className="voice-participant-video"
                  />
                ) : (
                  <img
                    src={state.avatar_url || `https://ui-avatars.com/api/?name=${state.username}`}
                    alt={state.username}
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${state.username}`
                    }}
                  />
                )}
                <span className={`status-indicator ${state.user_status || 'offline'}`}></span>
                {isSpeaking ? <div className="voice-participant-glow"></div> : null}
                {isMutedState ? <div className="voice-participant-mute-overlay">🔇</div> : null}
              </div>
              )
            }) : null}
            {otherUsers.length > 4 && (
              <div className="voice-participant-avatar more">
                +{otherUsers.length - 4}
              </div>
            )}
          </div>
        </div>

        {/* Hidden audio element for voice test */}
        <audio
          ref={testAudioElementRef}
          autoPlay
          playsInline
          muted={false}
          style={{ display: 'none' }}
        />
        
        {/* Video Display Area for Video Channels */}
        {channel.type === 'video' && !minimized && (
          <div className="voice-video-container">
            {/* Local Video */}
            {isVideoEnabled && (
              <div className="voice-video-item local">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="voice-video-element"
                />
                <div className="voice-video-label">
                  {user?.username} {isScreenSharing && '(Sharing Screen)'}
                </div>
              </div>
            )}
            
            {/* Remote Videos */}
            {otherUsers.filter(u => u.self_video).map(state => (
              <div key={state.user_id} className="voice-video-item remote">
                <video
                  ref={el => { 
                    if (el) {
                      remoteVideosRef.current[state.user_id] = el
                      // Also ensure audio is handled
                      if (el.srcObject) {
                        const stream = el.srcObject
                        const audioTrack = stream.getAudioTracks()[0]
                        if (audioTrack) {
                          let remoteAudio = remoteAudiosRef.current[state.user_id]
                          if (!remoteAudio) {
                            remoteAudio = document.createElement('audio')
                            remoteAudio.autoplay = true
                            remoteAudio.playsInline = true
                            remoteAudio.muted = false
                            document.body.appendChild(remoteAudio)
                            remoteAudiosRef.current[state.user_id] = remoteAudio
                            
                            if (selectedSpeaker) {
                              remoteAudio.setSinkId(selectedSpeaker).catch(e => {
                                console.warn('Could not set remote audio output:', e)
                              })
                            }
                          }
                          remoteAudio.srcObject = stream
                          remoteAudio.play().catch(e => {
                            console.warn('Could not play remote audio:', e)
                          })
                        }
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  muted={false}
                  className="voice-video-element"
                />
                <div className="voice-video-label">
                  {state.display_name || state.username}
                  {speakingUsers.has(state.user_id) && ' (Speaking)'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default VoicePanel
