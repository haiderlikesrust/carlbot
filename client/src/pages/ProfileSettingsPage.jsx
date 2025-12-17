import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAlert } from '../hooks/useAlert'
import Alert from '../components/Alert'
import LoadingScreen from '../components/LoadingScreen'
import './ProfileSettingsPage.css'

const API_BASE = 'http://localhost:3000/api'

function ProfileSettingsPage() {
  const navigate = useNavigate()
  const { user, token, updateUser } = useAuth()
  const { alert, showAlert, hideAlert } = useAlert()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  
  // Basic Info
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [username, setUsername] = useState('')
  
  // Appearance
  const [profileColor, setProfileColor] = useState('#00ff41')
  const [bannerImage, setBannerImage] = useState(null)
  const [bannerPreview, setBannerPreview] = useState('')
  const [avatarImage, setAvatarImage] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  
  // Social Links
  const [socialLinks, setSocialLinks] = useState({
    twitter: '',
    discord: '',
    twitch: '',
    youtube: '',
    instagram: '',
    tiktok: '',
    website: '',
    steam: '',
    epic: ''
  })
  
  // Privacy Settings
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: 'public',
    showEmail: false,
    showStats: true,
    showAchievements: true,
    showActivity: true,
    allowDMs: true,
    showOnlineStatus: true,
    showLastSeen: true
  })
  
  // Layout & Display
  const [layoutSettings, setLayoutSettings] = useState({
    postsPerRow: 3,
    showBanner: true,
    showStats: true,
    showAchievements: true,
    showSocialLinks: true,
    showFavoriteGames: true,
    profileLayout: 'default',
    cardStyle: 'default'
  })
  
  // Favorite Games
  const [favoriteGames, setFavoriteGames] = useState([])
  const [availableGames, setAvailableGames] = useState([])
  
  // Advanced
  const [customCSS, setCustomCSS] = useState('')
  const [profileTheme, setProfileTheme] = useState('default')
  
  useEffect(() => {
    if (!user) {
      navigate('/')
      return
    }
    fetchProfile()
    fetchGames()
  }, [user])

  const fetchGames = async () => {
    try {
      const response = await fetch(`${API_BASE}/games`)
      if (response.ok) {
        const data = await response.json()
        setAvailableGames(data)
      }
    } catch (error) {
      console.error('Failed to fetch games:', error)
    }
  }

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/profiles/user/${user.username}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (response.ok) {
        const data = await response.json()
        setDisplayName(data.display_name || '')
        setBio(data.bio || '')
        setUsername(data.username || '')
        setProfileColor(data.profile_color || '#00ff41')
        setBannerPreview(data.profile_banner ? `http://localhost:3000${data.profile_banner}` : '')
        setAvatarPreview(data.avatar_url ? `http://localhost:3000${data.avatar_url}` : '')
        
        // Fetch full profile with settings
        const meResponse = await fetch(`${API_BASE}/profiles/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (meResponse.ok) {
          const meData = await meResponse.json()
          if (meData.profile) {
            if (meData.profile.social_links) {
              const links = typeof meData.profile.social_links === 'string' 
                ? JSON.parse(meData.profile.social_links) 
                : meData.profile.social_links
              setSocialLinks({ ...socialLinks, ...links })
            }
            if (meData.profile.favorite_games) {
              setFavoriteGames(meData.profile.favorite_games)
            }
            if (meData.profile.settings) {
              const settings = typeof meData.profile.settings === 'string'
                ? JSON.parse(meData.profile.settings)
                : meData.profile.settings
              if (settings) {
                setPrivacySettings(prev => ({ ...prev, ...settings.privacy }))
                setLayoutSettings(prev => ({ ...prev, ...settings.layout }))
                setCustomCSS(settings.customCSS || '')
                setProfileTheme(settings.theme || 'default')
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
      showAlert('Failed to load profile settings', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleBannerUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showAlert('Banner image must be less than 5MB', 'error')
        return
      }
      setBannerImage(file)
      const reader = new FileReader()
      reader.onloadend = () => setBannerPreview(reader.result)
      reader.readAsDataURL(file)
    }
  }

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showAlert('Avatar image must be less than 2MB', 'error')
        return
      }
      setAvatarImage(file)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result)
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Upload images first
      let bannerUrl = null
      let avatarUrl = null

      // Handle banner upload
      if (bannerImage) {
        const bannerFormData = new FormData()
        bannerFormData.append('image', bannerImage)
        bannerFormData.append('type', 'banner')
        const bannerResponse = await fetch(`${API_BASE}/profiles/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: bannerFormData
        })
        if (bannerResponse.ok) {
          const bannerData = await bannerResponse.json()
          bannerUrl = bannerData.url
          console.log('Banner uploaded successfully:', bannerUrl)
        } else {
          const errorData = await bannerResponse.json().catch(() => ({ error: 'Upload failed' }))
          console.error('Banner upload failed:', errorData)
        }
      } else if (bannerPreview && bannerPreview.startsWith('http://localhost:3000')) {
        // Keep existing banner if no new upload
        bannerUrl = bannerPreview.replace('http://localhost:3000', '')
      }

      // Handle avatar upload
      if (avatarImage) {
        const avatarFormData = new FormData()
        avatarFormData.append('image', avatarImage)
        avatarFormData.append('type', 'avatar')
        const avatarResponse = await fetch(`${API_BASE}/profiles/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: avatarFormData
        })
        if (avatarResponse.ok) {
          const avatarData = await avatarResponse.json()
          avatarUrl = avatarData.url
          console.log('Avatar uploaded successfully:', avatarUrl)
          // Update preview immediately
          setAvatarPreview(`http://localhost:3000${avatarUrl}`)
        } else {
          const errorData = await avatarResponse.json().catch(() => ({ error: 'Upload failed' }))
          console.error('Avatar upload failed:', errorData)
          showAlert(errorData.error || 'Failed to upload avatar', 'error')
          setSaving(false)
          return
        }
      } else if (avatarPreview && avatarPreview.startsWith('http://localhost:3000')) {
        // Keep existing avatar if no new upload
        avatarUrl = avatarPreview.replace('http://localhost:3000', '')
      }

      // Update profile
      const settings = {
        privacy: privacySettings,
        layout: layoutSettings,
        customCSS,
        theme: profileTheme
      }

      const response = await fetch(`${API_BASE}/profiles/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          display_name: displayName,
          bio: bio,
          profile_color: profileColor,
          profile_banner: bannerUrl,
          avatar_url: avatarUrl, // Only send if we have a value (upload endpoint already updates DB)
          social_links: socialLinks,
          favorite_games: favoriteGames,
          settings: JSON.stringify(settings)
        })
      })

      if (response.ok) {
        showAlert('Profile updated successfully!', 'success')
        // Refresh user data to get updated avatar
        const userResponse = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          console.log('Updated user data:', userData)
          updateUser(userData)
        }
        // Force refresh the profile page
        setTimeout(() => {
          window.location.href = `/user/${user.username}`
        }, 500)
      } else {
        const data = await response.json()
        showAlert(data.error || 'Failed to update profile', 'error')
      }
    } catch (error) {
      console.error('Save error:', error)
      showAlert('Failed to save profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: '👤' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'social', label: 'Social Links', icon: '🔗' },
    { id: 'games', label: 'Favorite Games', icon: '🎮' },
    { id: 'privacy', label: 'Privacy', icon: '🔒' },
    { id: 'layout', label: 'Layout', icon: '📐' },
    { id: 'advanced', label: 'Advanced', icon: '⚙️' }
  ]

  if (loading) {
    return <LoadingScreen message="Loading profile settings..." />
  }

  return (
    <div className="profile-settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={() => navigate(`/user/${user?.username || ''}`)}>
          ← Back to Profile
        </button>
        <h1>⚙️ Profile Customization</h1>
      </header>

      <div className="settings-container">
        <div className="settings-sidebar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-content">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="settings-section">
              <h2>Basic Information</h2>
              <div className="form-group">
                <label>Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  maxLength={50}
                />
                <small>This is how others will see your name</small>
              </div>

              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  disabled
                  className="disabled-input"
                />
                <small>Username cannot be changed</small>
              </div>

              <div className="form-group">
                <label>Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={6}
                  maxLength={500}
                />
                <small>{bio.length}/500 characters</small>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="settings-section">
              <h2>Appearance</h2>
              
              <div className="form-group">
                <label>Profile Color</label>
                <div className="color-picker-group">
                  <input
                    type="color"
                    value={profileColor}
                    onChange={(e) => setProfileColor(e.target.value)}
                    className="color-picker"
                  />
                  <input
                    type="text"
                    value={profileColor}
                    onChange={(e) => setProfileColor(e.target.value)}
                    placeholder="#00ff41"
                    className="color-input"
                  />
                </div>
                <small>This color will be used for your profile accents</small>
              </div>

              <div className="form-group">
                <label>Profile Banner</label>
                <div className="image-upload-group">
                  {bannerPreview && (
                    <div className="image-preview">
                      <img src={bannerPreview} alt="Banner preview" />
                      <button 
                        className="remove-image-btn"
                        onClick={() => {
                          setBannerPreview('')
                          setBannerImage(null)
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    className="file-input"
                    id="banner-upload"
                  />
                  <label htmlFor="banner-upload" className="upload-btn">
                    {bannerPreview ? 'Change Banner' : 'Upload Banner'}
                  </label>
                  <small>Recommended: 1500x500px, max 5MB</small>
                </div>
              </div>

              <div className="form-group">
                <label>Avatar</label>
                <div className="image-upload-group">
                  {avatarPreview && (
                    <div className="avatar-preview">
                      <img src={avatarPreview} alt="Avatar preview" />
                      <button 
                        className="remove-image-btn"
                        onClick={() => {
                          setAvatarPreview('')
                          setAvatarImage(null)
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="file-input"
                    id="avatar-upload"
                  />
                  <label htmlFor="avatar-upload" className="upload-btn">
                    {avatarPreview ? 'Change Avatar' : 'Upload Avatar'}
                  </label>
                  <small>Recommended: 400x400px, max 2MB</small>
                </div>
              </div>

              <div className="form-group">
                <label>Profile Theme</label>
                <select
                  value={profileTheme}
                  onChange={(e) => setProfileTheme(e.target.value)}
                >
                  <option value="default">Default</option>
                  <option value="dark">Dark</option>
                  <option value="neon">Neon</option>
                  <option value="minimal">Minimal</option>
                  <option value="gaming">Gaming</option>
                  <option value="retro">Retro</option>
                </select>
              </div>
            </div>
          )}

          {/* Social Links Tab */}
          {activeTab === 'social' && (
            <div className="settings-section">
              <h2>Social Links</h2>
              <p className="section-description">Add links to your social media profiles</p>
              
              {Object.entries(socialLinks).map(([key, value]) => (
                <div key={key} className="form-group">
                  <label>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                    {key === 'website' && ' URL'}
                  </label>
                  <input
                    type="url"
                    value={value}
                    onChange={(e) => setSocialLinks(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`https://${key === 'website' ? 'yoursite.com' : key + '.com/yourusername'}`}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Favorite Games Tab */}
          {activeTab === 'games' && (
            <div className="settings-section">
              <h2>Favorite Games</h2>
              <p className="section-description">Select your favorite games to display on your profile</p>
              
              <div className="games-selector">
                {availableGames.map(game => (
                  <div
                    key={game.id}
                    className={`game-option ${favoriteGames.includes(game.id) ? 'selected' : ''}`}
                    onClick={() => {
                      if (favoriteGames.includes(game.id)) {
                        setFavoriteGames(favoriteGames.filter(id => id !== game.id))
                      } else {
                        setFavoriteGames([...favoriteGames, game.id])
                      }
                    }}
                  >
                    {game.icon && <span className="game-icon">{game.icon}</span>}
                    <span className="game-name">{game.name}</span>
                    {favoriteGames.includes(game.id) && <span className="check-mark">✓</span>}
                  </div>
                ))}
              </div>
              <small>Selected: {favoriteGames.length} games</small>
            </div>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <div className="settings-section">
              <h2>Privacy Settings</h2>
              
              <div className="form-group">
                <label>Profile Visibility</label>
                <select
                  value={privacySettings.profileVisibility}
                  onChange={(e) => setPrivacySettings(prev => ({ ...prev, profileVisibility: e.target.value }))}
                >
                  <option value="public">Public - Anyone can view</option>
                  <option value="followers">Followers Only</option>
                  <option value="private">Private - Only you</option>
                </select>
              </div>

              <div className="toggle-group">
                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={privacySettings.showStats}
                      onChange={(e) => setPrivacySettings(prev => ({ ...prev, showStats: e.target.checked }))}
                    />
                    <span>Show Statistics</span>
                  </label>
                  <small>Display follower count, posts count, etc.</small>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={privacySettings.showAchievements}
                      onChange={(e) => setPrivacySettings(prev => ({ ...prev, showAchievements: e.target.checked }))}
                    />
                    <span>Show Achievements</span>
                  </label>
                  <small>Display your unlocked achievements</small>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={privacySettings.showActivity}
                      onChange={(e) => setPrivacySettings(prev => ({ ...prev, showActivity: e.target.checked }))}
                    />
                    <span>Show Activity</span>
                  </label>
                  <small>Display recent activity on your profile</small>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={privacySettings.allowDMs}
                      onChange={(e) => setPrivacySettings(prev => ({ ...prev, allowDMs: e.target.checked }))}
                    />
                    <span>Allow Direct Messages</span>
                  </label>
                  <small>Let others send you private messages</small>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={privacySettings.showOnlineStatus}
                      onChange={(e) => setPrivacySettings(prev => ({ ...prev, showOnlineStatus: e.target.checked }))}
                    />
                    <span>Show Online Status</span>
                  </label>
                  <small>Display when you're online</small>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={privacySettings.showLastSeen}
                      onChange={(e) => setPrivacySettings(prev => ({ ...prev, showLastSeen: e.target.checked }))}
                    />
                    <span>Show Last Seen</span>
                  </label>
                  <small>Display when you were last active</small>
                </div>
              </div>
            </div>
          )}

          {/* Layout Tab */}
          {activeTab === 'layout' && (
            <div className="settings-section">
              <h2>Layout & Display</h2>
              
              <div className="form-group">
                <label>Profile Layout</label>
                <select
                  value={layoutSettings.profileLayout}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, profileLayout: e.target.value }))}
                >
                  <option value="default">Default</option>
                  <option value="compact">Compact</option>
                  <option value="detailed">Detailed</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>

              <div className="form-group">
                <label>Card Style</label>
                <select
                  value={layoutSettings.cardStyle}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, cardStyle: e.target.value }))}
                >
                  <option value="default">Default</option>
                  <option value="bordered">Bordered</option>
                  <option value="shadow">Shadow</option>
                  <option value="flat">Flat</option>
                </select>
              </div>

              <div className="form-group">
                <label>Posts Per Row</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={layoutSettings.postsPerRow}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, postsPerRow: parseInt(e.target.value) }))}
                />
                <small>How many posts to show per row in your profile</small>
              </div>

              <div className="toggle-group">
                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={layoutSettings.showBanner}
                      onChange={(e) => setLayoutSettings(prev => ({ ...prev, showBanner: e.target.checked }))}
                    />
                    <span>Show Banner</span>
                  </label>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={layoutSettings.showStats}
                      onChange={(e) => setLayoutSettings(prev => ({ ...prev, showStats: e.target.checked }))}
                    />
                    <span>Show Stats Section</span>
                  </label>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={layoutSettings.showAchievements}
                      onChange={(e) => setLayoutSettings(prev => ({ ...prev, showAchievements: e.target.checked }))}
                    />
                    <span>Show Achievements Section</span>
                  </label>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={layoutSettings.showSocialLinks}
                      onChange={(e) => setLayoutSettings(prev => ({ ...prev, showSocialLinks: e.target.checked }))}
                    />
                    <span>Show Social Links</span>
                  </label>
                </div>

                <div className="toggle-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={layoutSettings.showFavoriteGames}
                      onChange={(e) => setLayoutSettings(prev => ({ ...prev, showFavoriteGames: e.target.checked }))}
                    />
                    <span>Show Favorite Games</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === 'advanced' && (
            <div className="settings-section">
              <h2>Advanced Customization</h2>
              <p className="section-description">
                Add custom CSS to personalize your profile appearance. Use with caution!
              </p>
              
              <div className="form-group">
                <label>Custom CSS</label>
                <textarea
                  value={customCSS}
                  onChange={(e) => setCustomCSS(e.target.value)}
                  placeholder=".profile-container { background: #000; }"
                  rows={12}
                  className="code-textarea"
                />
                <small>This CSS will be applied to your profile page</small>
              </div>

              <div className="warning-box">
                <strong>⚠️ Warning:</strong> Custom CSS can break your profile layout. 
                Test carefully and keep backups of working code.
              </div>
            </div>
          )}

          <div className="settings-actions">
            <button onClick={handleSave} disabled={saving} className="save-btn">
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
            <button onClick={() => navigate(`/user/${user?.username || ''}`)} className="cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      </div>

      {alert && <Alert message={alert.message} type={alert.type} onClose={hideAlert} />}
    </div>
  )
}

export default ProfileSettingsPage
