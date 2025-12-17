import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import PageTransition from './components/PageTransition'
import LoadingScreen from './components/LoadingScreen'
import App from './App'
import AuthCallback from './pages/AuthCallback'
import SocialFeedPage from './pages/SocialFeedPage'
import CommunitiesPage from './pages/CommunitiesPage'
import CommunityPage from './pages/CommunityPage'
import CarlbotProfilePage from './pages/CarlbotProfilePage'
import PostPage from './pages/PostPage'
import UserProfilePage from './pages/UserProfilePage'
import ProfileSettingsPage from './pages/ProfileSettingsPage'
import MessagesPage from './pages/MessagesPage'
import DiscordPage from './pages/DiscordPage'
import InvitePage from './pages/InvitePage'
import ServerSettingsPage from './pages/ServerSettingsPage'
import AdminPanel from './pages/AdminPanel'
import AchievementsPage from './pages/AchievementsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  console.error('Root element not found!')
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <PageTransition>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<App />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/social" element={<SocialFeedPage />} />
                <Route path="/communities" element={<CommunitiesPage />} />
                <Route path="/communities/:slug" element={<CommunityPage />} />
                <Route path="/carlbot" element={<CarlbotProfilePage />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/achievements" element={<AchievementsPage />} />
                <Route path="/achievements/:userId" element={<AchievementsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/post/:postId" element={<PostPage />} />
            <Route path="/user/:username" element={<UserProfilePage />} />
            <Route path="/settings/profile" element={<ProfileSettingsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/discord" element={<DiscordPage />} />
            <Route path="/carlcord" element={<DiscordPage />} />
            <Route path="/carlcord/server/:serverId/settings" element={<ServerSettingsPage />} />
            <Route path="/invite/:code" element={<InvitePage />} />
              </Routes>
            </Suspense>
          </PageTransition>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  )
}

