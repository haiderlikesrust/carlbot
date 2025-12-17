import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE } from '../config.js'
import './ServerSettingsPage.css'

function ServerSettingsPage() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [roles, setRoles] = useState([])
  const [channels, setChannels] = useState([])
  const [members, setMembers] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasManageRoles, setHasManageRoles] = useState(false)
  const [hasManageChannels, setHasManageChannels] = useState(false)
  const [hasManageServer, setHasManageServer] = useState(false)

  useEffect(() => {
    if (!token || !serverId) {
      navigate('/carlcord')
      return
    }
    fetchServer()
    fetchRoles()
    fetchChannels()
    fetchMembers()
  }, [serverId, token])

  const fetchServer = async () => {
    try {
      const response = await fetch(`${API_BASE}/servers/${serverId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        const serverData = data.server || data
        setServer(serverData)
        const isOwnerCheck = serverData.owner_id === user?.id
        setIsOwner(isOwnerCheck)
        
        // Check admin status and permissions
        const memberResponse = await fetch(`${API_BASE}/servers/${serverId}/members`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (memberResponse.ok) {
          const memberData = await memberResponse.json()
          const currentMember = memberData.members?.find(m => m.user_id === user?.id)
          const isAdminCheck = currentMember?.role === 'admin'
          setIsAdmin(isAdminCheck)
          
          // Permission checks (owner has all, admin has most)
          setHasManageRoles(isOwnerCheck || isAdminCheck)
          setHasManageChannels(isOwnerCheck || isAdminCheck)
          setHasManageServer(isOwnerCheck)
        } else {
          // If can't fetch members, assume no permissions
          setIsAdmin(false)
          setHasManageRoles(isOwnerCheck)
          setHasManageChannels(isOwnerCheck)
          setHasManageServer(isOwnerCheck)
        }
      } else {
        navigate('/carlcord')
      }
    } catch (error) {
      console.error('Failed to fetch server:', error)
      navigate('/carlcord')
    } finally {
      setLoading(false)
    }
  }

  const fetchRoles = async () => {
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

  const fetchChannels = async () => {
    try {
      const response = await fetch(`${API_BASE}/channels/server/${serverId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setChannels(data.channels || [])
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    }
  }

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/servers/${serverId}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setMembers(data.members || [])
      }
    } catch (error) {
      console.error('Failed to fetch members:', error)
    }
  }

  if (loading) {
    return (
      <div className="server-settings-loading">
        <div className="loading-spinner"></div>
        <p>Loading server settings...</p>
      </div>
    )
  }

  if (!server || (!isOwner && !isAdmin)) {
    return (
      <div className="server-settings-error">
        <h2>Access Denied</h2>
        <p>You don't have permission to access server settings.</p>
        <button onClick={() => navigate('/carlcord')} className="back-btn">
          Back to Carlcord
        </button>
      </div>
    )
  }

  return (
    <div className="server-settings-page">
      <div className="server-settings-header">
        <button onClick={() => navigate('/carlcord')} className="back-btn">
          ← Back
        </button>
        <h1>Server Settings: {server.name}</h1>
      </div>

      <div className="server-settings-container">
        <div className="settings-sidebar">
          <div className="sidebar-section">
            <h3>Settings</h3>
            <button 
              className={`sidebar-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            {(hasManageServer || hasManageChannels) && (
              <button 
                className={`sidebar-tab ${activeTab === 'channels' ? 'active' : ''}`}
                onClick={() => setActiveTab('channels')}
              >
                Channels
              </button>
            )}
            {(hasManageServer || hasManageRoles) && (
              <button 
                className={`sidebar-tab ${activeTab === 'roles' ? 'active' : ''}`}
                onClick={() => setActiveTab('roles')}
              >
                Roles
              </button>
            )}
            {hasManageServer && (
              <>
                <button 
                  className={`sidebar-tab ${activeTab === 'members' ? 'active' : ''}`}
                  onClick={() => setActiveTab('members')}
                >
                  Members
                </button>
                <button 
                  className={`sidebar-tab ${activeTab === 'moderation' ? 'active' : ''}`}
                  onClick={() => setActiveTab('moderation')}
                >
                  Moderation
                </button>
                <button 
                  className={`sidebar-tab ${activeTab === 'appearance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('appearance')}
                >
                  Appearance
                </button>
                <button 
                  className={`sidebar-tab ${activeTab === 'permissions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('permissions')}
                >
                  Access Control
                </button>
              </>
            )}
          </div>
        </div>

        <div className="settings-content">
          {activeTab === 'overview' && (
            <OverviewTab server={server} onUpdate={setServer} token={token} hasManageServer={hasManageServer} />
          )}
          {activeTab === 'channels' && (
            <ChannelsTab 
              serverId={serverId} 
              channels={channels} 
              onUpdate={fetchChannels} 
              token={token} 
              hasManageChannels={hasManageChannels}
            />
          )}
          {activeTab === 'roles' && (
            <RolesTab 
              serverId={serverId} 
              roles={roles} 
              onUpdate={fetchRoles} 
              token={token} 
              hasManageRoles={hasManageRoles}
            />
          )}
          {activeTab === 'members' && hasManageServer && (
            <MembersTab serverId={serverId} members={members} onUpdate={fetchMembers} token={token} />
          )}
          {activeTab === 'moderation' && hasManageServer && (
            <ModerationTab serverId={serverId} server={server} token={token} />
          )}
          {activeTab === 'appearance' && hasManageServer && (
            <AppearanceTab server={server} onUpdate={setServer} token={token} />
          )}
          {activeTab === 'permissions' && hasManageServer && (
            <PermissionsTab serverId={serverId} members={members} onUpdate={fetchMembers} token={token} />
          )}
        </div>
      </div>
    </div>
  )
}

// Overview Tab Component
function OverviewTab({ server, onUpdate, token, hasManageServer }) {
  const [name, setName] = useState(server?.name || '')
  const [description, setDescription] = useState(server?.description || '')
  const [icon, setIcon] = useState(server?.server_icon || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (server) {
      setName(server.name || '')
      setDescription(server.description || '')
      setIcon(server.server_icon || '')
    }
  }, [server])

  const handleSave = async () => {
    if (!hasManageServer) return
    setSaving(true)
    try {
      const response = await fetch(`${API_BASE}/servers/${server.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          icon: icon.trim() || null
        })
      })
      if (response.ok) {
        const data = await response.json()
        onUpdate(data.server)
        alert('Server updated successfully!')
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to update server')
      }
    } catch (error) {
      alert('Failed to update server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-tab">
      <h2>Server Overview</h2>
      <div className="settings-section">
        <label>Server Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!hasManageServer}
          className="settings-input"
        />
      </div>
      <div className="settings-section">
        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!hasManageServer}
          className="settings-textarea"
          rows={4}
        />
      </div>
      <div className="settings-section">
        <label>Server Icon URL</label>
        <input
          type="url"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          disabled={!hasManageServer}
          className="settings-input"
        />
        {icon && (
          <div className="icon-preview">
            <img src={icon} alt="Icon preview" onError={(e) => e.target.style.display = 'none'} />
          </div>
        )}
      </div>
      {hasManageServer && (
        <button onClick={handleSave} disabled={saving || !name.trim()} className="save-btn">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  )
}

// Channels Tab Component
function ChannelsTab({ serverId, channels, onUpdate, token, hasManageChannels }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingChannel, setEditingChannel] = useState(null)

  const handleDelete = async (channelId) => {
    if (!confirm('Are you sure you want to delete this channel?')) return
    try {
      const response = await fetch(`${API_BASE}/channels/${channelId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        onUpdate()
      } else {
        alert('Failed to delete channel')
      }
    } catch (error) {
      alert('Failed to delete channel')
    }
  }

  return (
    <div className="settings-tab">
      <div className="tab-header">
        <h2>Channels</h2>
        {hasManageChannels && (
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + Create Channel
          </button>
        )}
      </div>
      <div className="channels-list">
        {channels.map(channel => (
          <div key={channel.id} className="channel-item">
            <div className="channel-info">
              <span className="channel-type">{channel.type === 'voice' ? '🔊' : '💬'}</span>
              <span className="channel-name">{channel.name}</span>
              {channel.topic && <span className="channel-topic">{channel.topic}</span>}
            </div>
            {hasManageChannels && (
              <div className="channel-actions">
                <button onClick={() => setEditingChannel(channel)} className="edit-btn">Edit</button>
                <button onClick={() => handleDelete(channel.id)} className="delete-btn">Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {showCreateModal && (
        <ChannelModal
          serverId={serverId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={onUpdate}
          token={token}
        />
      )}
      {editingChannel && (
        <ChannelModal
          serverId={serverId}
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSuccess={() => {
            setEditingChannel(null)
            onUpdate()
          }}
          token={token}
        />
      )}
    </div>
  )
}

// Channel Modal Component
function ChannelModal({ serverId, channel, onClose, onSuccess, token }) {
  const [name, setName] = useState(channel?.name || '')
  const [type, setType] = useState(channel?.type || 'text')
  const [topic, setTopic] = useState(channel?.topic || '')
  const [position, setPosition] = useState(channel?.position || 0)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const url = channel 
        ? `${API_BASE}/channels/${channel.id}`
        : `${API_BASE}/channels`
      const method = channel ? 'PUT' : 'POST'
      const body = channel
        ? { name: name.trim(), topic: topic.trim() || null, position }
        : { server_id: serverId, name: name.trim(), type, topic: topic.trim() || null, position }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      if (response.ok) {
        onSuccess()
        onClose()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to save channel')
      }
    } catch (error) {
      alert('Failed to save channel')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{channel ? 'Edit Channel' : 'Create Channel'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Channel Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              required
            />
          </div>
          {!channel && (
            <div className="form-group">
              <label>Channel Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="form-input">
                <option value="text">Text Channel</option>
                <option value="voice">Voice Channel</option>
                <option value="video">Video Channel</option>
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Topic (Optional)</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="form-input"
            />
          </div>
          {channel && (
            <div className="form-group">
              <label>Position</label>
              <input
                type="number"
                value={position}
                onChange={(e) => setPosition(parseInt(e.target.value) || 0)}
                className="form-input"
              />
            </div>
          )}
          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
            <button type="submit" disabled={saving} className="save-btn">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Roles Tab Component
function RolesTab({ serverId, roles, onUpdate, token, hasManageRoles }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRole, setEditingRole] = useState(null)

  const handleDelete = async (roleId) => {
    if (!confirm('Are you sure you want to delete this role?')) return
    try {
      const response = await fetch(`${API_BASE}/roles/${roleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        onUpdate()
      } else {
        alert('Failed to delete role')
      }
    } catch (error) {
      alert('Failed to delete role')
    }
  }

  return (
    <div className="settings-tab">
      <div className="tab-header">
        <h2>Roles</h2>
        {hasManageRoles && (
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + Create Role
          </button>
        )}
      </div>
      <div className="roles-list">
        {roles.map(role => (
          <div key={role.id} className="role-item">
            <div className="role-info">
              <div 
                className="role-color-indicator" 
                style={{ backgroundColor: role.color || '#00ff41' }}
              ></div>
              <span className="role-name">{role.name}</span>
              {role.hoist && <span className="role-badge">Hoisted</span>}
              {role.mentionable && <span className="role-badge">Mentionable</span>}
            </div>
            {hasManageRoles && (
              <div className="role-actions">
                <button onClick={() => setEditingRole(role)} className="edit-btn">Edit</button>
                <button onClick={() => handleDelete(role.id)} className="delete-btn">Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {showCreateModal && (
        <RoleModal
          serverId={serverId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={onUpdate}
          token={token}
        />
      )}
      {editingRole && (
        <RoleModal
          serverId={serverId}
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSuccess={() => {
            setEditingRole(null)
            onUpdate()
          }}
          token={token}
        />
      )}
    </div>
  )
}

// Role Modal Component (simplified - will expand with permissions)
function RoleModal({ serverId, role, onClose, onSuccess, token }) {
  const [name, setName] = useState(role?.name || '')
  const [color, setColor] = useState(role?.color || '#00ff41')
  const [hoist, setHoist] = useState(role?.hoist || false)
  const [mentionable, setMentionable] = useState(role?.mentionable || false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const url = role 
        ? `${API_BASE}/roles/${role.id}`
        : `${API_BASE}/roles/server/${serverId}`
      const method = role ? 'PUT' : 'POST'
      const body = role
        ? { name: name.trim(), color, hoist: hoist ? 1 : 0, mentionable: mentionable ? 1 : 0 }
        : { name: name.trim(), color, hoist: hoist ? 1 : 0, mentionable: mentionable ? 1 : 0, permissions: '0' }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      if (response.ok) {
        onSuccess()
        onClose()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to save role')
      }
    } catch (error) {
      alert('Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{role ? 'Edit Role' : 'Create Role'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Role Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="color-picker-group">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="color-picker"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="color-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={hoist}
                onChange={(e) => setHoist(e.target.checked)}
              />
              Display role members separately
            </label>
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={mentionable}
                onChange={(e) => setMentionable(e.target.checked)}
              />
              Allow anyone to @mention this role
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
            <button type="submit" disabled={saving} className="save-btn">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Members Tab Component (placeholder)
function MembersTab({ serverId, members, onUpdate, token }) {
  return (
    <div className="settings-tab">
      <h2>Members</h2>
      <div className="members-list">
        {members.map(member => (
          <div key={member.user_id} className="member-item">
            <span>{member.username || member.display_name}</span>
            <span className="member-role">{member.role}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Moderation Tab Component (placeholder)
function ModerationTab({ serverId, server, token }) {
  return (
    <div className="settings-tab">
      <h2>Moderation Settings</h2>
      <p>Moderation tools coming soon...</p>
    </div>
  )
}

// Appearance Tab Component
function AppearanceTab({ server, onUpdate, token }) {
  const [primaryColor, setPrimaryColor] = useState(server?.primary_color || '#00ff41')
  const [secondaryColor, setSecondaryColor] = useState(server?.secondary_color || '#00d4ff')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`${API_BASE}/servers/${server.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          primary_color: primaryColor,
          secondary_color: secondaryColor
        })
      })
      if (response.ok) {
        const data = await response.json()
        onUpdate(data.server)
        alert('Appearance updated successfully!')
      } else {
        alert('Failed to update appearance')
      }
    } catch (error) {
      alert('Failed to update appearance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-tab">
      <h2>Server Appearance</h2>
      <div className="settings-section">
        <label>Primary Color</label>
        <div className="color-picker-group">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="color-picker"
          />
          <input
            type="text"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="color-input"
          />
        </div>
      </div>
      <div className="settings-section">
        <label>Secondary Color</label>
        <div className="color-picker-group">
          <input
            type="color"
            value={secondaryColor}
            onChange={(e) => setSecondaryColor(e.target.value)}
            className="color-picker"
          />
          <input
            type="text"
            value={secondaryColor}
            onChange={(e) => setSecondaryColor(e.target.value)}
            className="color-input"
          />
        </div>
      </div>
      <button onClick={handleSave} disabled={saving} className="save-btn">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  )
}

// Permissions Tab Component (Mod Access Control)
function PermissionsTab({ serverId, members, onUpdate, token }) {
  const [modAccessSettings, setModAccessSettings] = useState({})
  const [saving, setSaving] = useState(false)

  // Filter to only show mods/admins
  const mods = members.filter(m => m.role === 'admin' || m.role === 'moderator')

  const handleToggleAccess = async (userId, setting, value) => {
    // TODO: Implement API endpoint for mod access control
    console.log('Toggle access:', userId, setting, value)
  }

  return (
    <div className="settings-tab">
      <h2>Moderator Access Control</h2>
      <p className="settings-description">
        Control which moderators can access server settings and what they can modify.
      </p>
      <div className="mod-access-list">
        {mods.map(mod => (
          <div key={mod.user_id} className="mod-access-item">
            <div className="mod-info">
              <span className="mod-name">{mod.username || mod.display_name}</span>
              <span className="mod-role">{mod.role}</span>
            </div>
            <div className="mod-permissions">
              <label>
                <input
                  type="checkbox"
                  checked={modAccessSettings[mod.user_id]?.canManageChannels || false}
                  onChange={(e) => handleToggleAccess(mod.user_id, 'canManageChannels', e.target.checked)}
                />
                Manage Channels
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={modAccessSettings[mod.user_id]?.canManageRoles || false}
                  onChange={(e) => handleToggleAccess(mod.user_id, 'canManageRoles', e.target.checked)}
                />
                Manage Roles
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={modAccessSettings[mod.user_id]?.canManageServer || false}
                  onChange={(e) => handleToggleAccess(mod.user_id, 'canManageServer', e.target.checked)}
                />
                Manage Server
              </label>
            </div>
          </div>
        ))}
        {mods.length === 0 && (
          <p className="no-mods">No moderators found. Assign admin or moderator roles to members first.</p>
        )}
      </div>
    </div>
  )
}

export default ServerSettingsPage
