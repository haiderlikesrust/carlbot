import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { showPrompt, showConfirm, showAlert } from '../utils/dialogs'
import './FriendsList.css'

const API_BASE = 'http://localhost:3000/api'

function FriendsList({ onSelectFriend }) {
  const { user, token } = useAuth()
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [activeTab, setActiveTab] = useState('online') // online, all, pending, blocked

  useEffect(() => {
    if (token) {
      fetchFriends()
      fetchPendingRequests()
    }
  }, [token])

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

  const fetchPendingRequests = async () => {
    try {
      const response = await fetch(`${API_BASE}/friends?status=pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setPendingRequests(data.friendships || [])
      }
    } catch (error) {
      console.error('Failed to fetch pending requests:', error)
    }
  }

  const acceptRequest = async (friendId) => {
    try {
      const response = await fetch(`${API_BASE}/friends/accept/${friendId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchFriends()
        fetchPendingRequests()
      }
    } catch (error) {
      console.error('Failed to accept request:', error)
    }
  }

  const sendFriendRequest = async (username) => {
    try {
      const response = await fetch(`${API_BASE}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username })
      })
      
      if (response.ok) {
        const data = await response.json()
        await showAlert(data.message || 'Friend request sent!', 'Success')
        fetchPendingRequests()
      } else {
        const error = await response.json()
        await showAlert(error.error || 'Failed to send friend request', 'Error')
      }
    } catch (error) {
      console.error('Failed to send friend request:', error)
      await showAlert('Failed to send friend request', 'Error')
    }
  }

  const removeFriend = async (friendId) => {
    const confirmed = await showConfirm('Remove this friend?', 'Confirm')
    if (!confirmed) return

    try {
      const response = await fetch(`${API_BASE}/friends/${friendId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchFriends()
        fetchPendingRequests()
      }
    } catch (error) {
      console.error('Failed to remove friend:', error)
      await showAlert('Failed to remove friend', 'Error')
    }
  }

  const onlineFriends = friends.filter(f => f.friend_status === 'online')
  const allFriends = friends
  const incomingRequests = pendingRequests.filter(f => f.friend_id === user?.id)

  const displayFriends = activeTab === 'online' ? onlineFriends : 
                        activeTab === 'all' ? allFriends :
                        activeTab === 'pending' ? incomingRequests : []

  return (
    <div className="friends-list">
      <div className="friends-header">
        <h3>Friends</h3>
        <button 
          className="add-friend-btn" 
          title="Add Friend"
          onClick={async () => {
            const username = await showPrompt('Enter username to add as friend:', '', 'Add Friend')
            if (username && username.trim()) {
              sendFriendRequest(username.trim())
            }
          }}
        >
          +
        </button>
      </div>

      <div className="friends-tabs">
        <button 
          className={activeTab === 'online' ? 'active' : ''}
          onClick={() => setActiveTab('online')}
        >
          Online ({onlineFriends.length})
        </button>
        <button 
          className={activeTab === 'all' ? 'active' : ''}
          onClick={() => setActiveTab('all')}
        >
          All ({allFriends.length})
        </button>
        {incomingRequests.length > 0 && (
          <button 
            className={activeTab === 'pending' ? 'active' : ''}
            onClick={() => setActiveTab('pending')}
          >
            Pending ({incomingRequests.length})
          </button>
        )}
      </div>

      <div className="friends-content">
        {activeTab === 'pending' && incomingRequests.length > 0 && (
          <div className="pending-requests">
            {incomingRequests.map(request => (
              <div key={request.id} className="friend-item pending">
                <img
                  src={request.friend_avatar || `https://ui-avatars.com/api/?name=${request.friend_username}`}
                  alt={request.friend_username}
                  className="friend-avatar"
                />
                <div className="friend-info">
                  <div className="friend-name">{request.friend_display_name || request.friend_username}</div>
                </div>
                <div className="friend-actions">
                  <button 
                    className="accept-btn"
                    onClick={() => acceptRequest(request.user_id)}
                  >
                    Accept
                  </button>
                  <button 
                    className="reject-btn"
                    onClick={() => removeFriend(request.user_id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {displayFriends.length === 0 ? (
          <div className="no-friends">
            {activeTab === 'online' && 'No friends online'}
            {activeTab === 'all' && 'No friends yet'}
            {activeTab === 'pending' && 'No pending requests'}
          </div>
        ) : (
          displayFriends.map(friend => (
            <div 
              key={friend.friend_user_id} 
              className="friend-item"
              onClick={() => onSelectFriend && onSelectFriend(friend)}
            >
              <div className="friend-avatar-wrapper">
                <img
                  src={friend.friend_avatar || `https://ui-avatars.com/api/?name=${friend.friend_username}`}
                  alt={friend.friend_username}
                  className="friend-avatar"
                />
                <span className={`status-indicator ${friend.friend_status || 'offline'}`}></span>
              </div>
              <div className="friend-info">
                <div className="friend-name">{friend.friend_display_name || friend.friend_username}</div>
                {friend.friend_custom_status && (
                  <div className="friend-status">{friend.friend_custom_status}</div>
                )}
                {friend.friend_game && (
                  <div className="friend-game">🎮 {friend.friend_game}</div>
                )}
              </div>
              {activeTab === 'all' && (
                <button 
                  className="remove-friend-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFriend(friend.friend_user_id)
                  }}
                  title="Remove Friend"
                >
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default FriendsList
