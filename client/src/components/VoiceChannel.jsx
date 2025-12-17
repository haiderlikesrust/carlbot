import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import io from 'socket.io-client'
import './VoiceChannel.css'

const API_BASE = 'http://localhost:3000/api'
const SOCKET_URL = 'http://localhost:3000'

function VoiceChannel({ channel, onClose }) {
  const { user, token } = useAuth()
  const [voiceStates, setVoiceStates] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(channel?.type === 'video')
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [speakingUsers, setSpeakingUsers] = useState(new Set())
  
  const localVideoRef = useRef(null)
  const remoteVideosRef = useRef({})
  const peersRef = useRef({})
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const socketRef = useRef(null)
  const audioContextRef = useRef(null)
  const analysersRef = useRef({})
  
  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  useEffect(() => {
    if (!channel || !token) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token }
    })

    socket.on('connect', () => {
      socket.emit('authenticate', token)
      socket.emit('join_voice_channel', channel.id)
      setIsConnected(true)
    })

    socketRef.current = socket
    joinVoiceChannel()

    socket.on('voice_state_update', (data) => {
      if (data.channel_id === channel.id) {
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
      leaveVoiceChannel()
      socket.emit('leave_voice_channel', channel.id)
      socket.disconnect()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [channel, token])

  useEffect(() => {
    fetchVoiceStates()
    const interval = setInterval(fetchVoiceStates, 3000)
    return () => clearInterval(interval)
  }, [channel])

  // Voice activity detection
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }

    const detectVoiceActivity = () => {
      Object.entries(peersRef.current).forEach(([userId, pc]) => {
        const receiver = pc.getReceivers().find(r => r.track && r.track.kind === 'audio')
        if (receiver && receiver.track) {
          if (!analysersRef.current[userId]) {
            const source = audioContextRef.current.createMediaStreamSource(
              new MediaStream([receiver.track])
            )
            const analyser = audioContextRef.current.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            analysersRef.current[userId] = analyser
          }

          const analyser = analysersRef.current[userId]
          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(dataArray)
          
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          const isSpeaking = average > 30 // Threshold

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

    const interval = setInterval(detectVoiceActivity, 100)
    return () => clearInterval(interval)
  }, [voiceStates])

  const fetchVoiceStates = async () => {
    try {
      const response = await fetch(`${API_BASE}/voice/channel/${channel.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setVoiceStates(data.voice_states || [])
        
        data.voice_states.forEach(state => {
          if (state.user_id !== user.id && !peersRef.current[state.user_id]) {
            createPeerConnection(state.user_id)
          }
        })
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
          server_id: channel.server_id
        })
      })

      if (response.ok) {
        await startLocalMedia()
        fetchVoiceStates()
      }
    } catch (error) {
      console.error('Failed to join voice channel:', error)
    }
  }

  const leaveVoiceChannel = async () => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
        screenStreamRef.current = null
      }

      Object.values(peersRef.current).forEach(pc => pc.close())
      peersRef.current = {}
      analysersRef.current = {}

      await fetch(`${API_BASE}/voice/leave`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (error) {
      console.error('Failed to leave voice channel:', error)
    }
  }

  const startLocalMedia = async () => {
    try {
      const constraints = {
        audio: true,
        video: channel.type === 'video' ? {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } : false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream

      if (localVideoRef.current && channel.type === 'video') {
        localVideoRef.current.srcObject = stream
      }

      Object.values(peersRef.current).forEach(pc => {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream)
        })
      })
    } catch (error) {
      console.error('Failed to get user media:', error)
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
      const remoteVideo = remoteVideosRef.current[targetUserId]
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0]
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
        const remoteVideo = remoteVideosRef.current[fromUserId]
        if (remoteVideo) {
          remoteVideo.srcObject = event.streams[0]
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

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    if (socketRef.current) {
      socketRef.current.emit('webrtc_answer', {
        targetUserId: fromUserId,
        answer: pc.localDescription,
        channelId: channel.id
      })
    }
  }

  const handleAnswer = async (fromUserId, answer) => {
    const pc = peersRef.current[fromUserId]
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
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

  const currentUserState = voiceStates.find(s => s.user_id === user.id)
  const otherUsers = voiceStates.filter(s => s.user_id !== user.id)

  return (
    <div className="voice-channel-wrapper">
      <div className="voice-channel-container">
        {/* Compact Header */}
        <div className="voice-header-compact">
          <div className="voice-header-info">
            <span className="voice-channel-icon">{channel.type === 'video' ? '📹' : '🔊'}</span>
            <span className="voice-channel-name">{channel.name}</span>
          </div>
          <button className="voice-close-btn" onClick={onClose} title="Close">×</button>
        </div>

        {/* User List - Avatar First Design */}
        <div className="voice-users-panel">
          {currentUserState && (
            <div className={`voice-user-avatar-item ${isMuted ? 'muted' : ''} ${speakingUsers.has(user.id) ? 'speaking' : ''}`}>
              <div className="avatar-wrapper">
                <img
                  src={currentUserState.avatar_url || `https://ui-avatars.com/api/?name=${currentUserState.username}`}
                  alt={currentUserState.username}
                  className="user-avatar-circle"
                />
                {isMuted && <div className="avatar-status-overlay mute">🔇</div>}
                {isDeafened && <div className="avatar-status-overlay deaf">🔊</div>}
                {speakingUsers.has(user.id) && <div className="speaking-glow"></div>}
              </div>
              <span className="avatar-username">{currentUserState.display_name || currentUserState.username}</span>
            </div>
          )}

          {otherUsers.map(state => {
            const isSpeaking = speakingUsers.has(state.user_id)
            const isMutedState = state.self_mute || state.self_deaf
            return (
              <div
                key={state.user_id}
                className={`voice-user-avatar-item ${isMutedState ? 'muted' : ''} ${isSpeaking ? 'speaking' : ''}`}
              >
                <div className="avatar-wrapper">
                  <img
                    src={state.avatar_url || `https://ui-avatars.com/api/?name=${state.username}`}
                    alt={state.username}
                    className="user-avatar-circle"
                  />
                  {state.self_mute && <div className="avatar-status-overlay mute">🔇</div>}
                  {state.self_deaf && <div className="avatar-status-overlay deaf">🔊</div>}
                  {isSpeaking && <div className="speaking-glow"></div>}
                </div>
                <span className="avatar-username">{state.display_name || state.username}</span>
              </div>
            )
          })}
        </div>

        {/* Compact Controls */}
        <div className="voice-controls-compact">
          <button
            className={`voice-control-icon ${isMuted ? 'active' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          <button
            className={`voice-control-icon ${isDeafened ? 'active' : ''}`}
            onClick={toggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? '🔊' : '🔊'}
          </button>
          {channel.type === 'video' && (
            <>
              <button
                className={`voice-control-icon ${!isVideoEnabled ? 'active' : ''}`}
                onClick={toggleVideo}
                title={isVideoEnabled ? 'Disable Video' : 'Enable Video'}
              >
                📹
              </button>
              <button
                className={`voice-control-icon ${isScreenSharing ? 'active' : ''}`}
                onClick={toggleScreenShare}
                title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              >
                🖥️
              </button>
            </>
          )}
          <button
            className="voice-control-icon leave"
            onClick={() => {
              leaveVoiceChannel()
              onClose()
            }}
            title="Leave Channel"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  )
}

export default VoiceChannel
