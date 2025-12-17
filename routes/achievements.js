import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Helper function to check and award achievements
export function checkAchievements(db, userId) {
  try {
    // Get or create user stats
    let userStats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId)
    
    if (!userStats) {
      // Initialize user stats
      const postsCount = db.prepare('SELECT COUNT(*) as count FROM social_posts WHERE user_id = ?').get(userId)?.count || 0
      const commentsCount = db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE user_id = ?').get(userId)?.count || 0
      const likesReceived = db.prepare(`
        SELECT COALESCE(SUM(likes_count), 0) as total FROM social_posts WHERE user_id = ?
      `).get(userId)?.total || 0
      const followersCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(userId)?.count || 0
      const followingCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(userId)?.count || 0
      
      db.prepare(`
        INSERT INTO user_stats (user_id, posts_count, comments_count, likes_received, followers_count, following_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, postsCount, commentsCount, likesReceived, followersCount, followingCount)
      
      userStats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId)
    }
    
    // Update stats
    const postsCount = db.prepare('SELECT COUNT(*) as count FROM social_posts WHERE user_id = ?').get(userId)?.count || 0
    const commentsCount = db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE user_id = ?').get(userId)?.count || 0
    const likesReceived = db.prepare(`
      SELECT COALESCE(SUM(likes_count), 0) as total FROM social_posts WHERE user_id = ?
    `).get(userId)?.total || 0
    const followersCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(userId)?.count || 0
    
    // Calculate level and XP (100 XP per level, XP from points)
    const totalPoints = userStats.total_points || 0
    const level = Math.floor(totalPoints / 100) + 1
    const xp = totalPoints % 100
    
    // Update streak
    const today = new Date().toISOString().split('T')[0]
    let streakDays = userStats.streak_days || 0
    if (userStats.last_activity_date) {
      const lastDate = new Date(userStats.last_activity_date).toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      if (lastDate === yesterday || lastDate === today) {
        if (lastDate === yesterday) streakDays += 1
      } else {
        streakDays = 1
      }
    } else {
      streakDays = 1
    }
    
    db.prepare(`
      UPDATE user_stats 
      SET posts_count = ?, comments_count = ?, likes_received = ?, followers_count = ?,
          level = ?, xp = ?, streak_days = ?, last_activity_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(postsCount, commentsCount, likesReceived, followersCount, level, xp, streakDays, today, userId)
    
    // Get all achievements
    const achievements = db.prepare('SELECT * FROM achievements').all()
    const earnedAchievements = db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(userId)
    const earnedIds = new Set(earnedAchievements.map(e => e.achievement_id))
    
    const newAchievements = []
    
    // Check each achievement
    for (const achievement of achievements) {
      if (earnedIds.has(achievement.id)) continue
      
      let shouldAward = false
      let progress = 0
      
      switch (achievement.requirement_type) {
        case 'posts':
          progress = Math.min((postsCount / achievement.requirement_value) * 100, 100)
          shouldAward = postsCount >= achievement.requirement_value
          break
        case 'comments':
          progress = Math.min((commentsCount / achievement.requirement_value) * 100, 100)
          shouldAward = commentsCount >= achievement.requirement_value
          break
        case 'likes_received':
          progress = Math.min((likesReceived / achievement.requirement_value) * 100, 100)
          shouldAward = likesReceived >= achievement.requirement_value
          break
        case 'followers':
          progress = Math.min((followersCount / achievement.requirement_value) * 100, 100)
          shouldAward = followersCount >= achievement.requirement_value
          break
        case 'level':
          progress = Math.min((level / achievement.requirement_value) * 100, 100)
          shouldAward = level >= achievement.requirement_value
          break
        case 'streak':
          progress = Math.min((streakDays / achievement.requirement_value) * 100, 100)
          shouldAward = streakDays >= achievement.requirement_value
          break
      }
      
      if (shouldAward) {
        // Award achievement
        db.prepare(`
          INSERT INTO user_achievements (user_id, achievement_id, progress)
          VALUES (?, ?, ?)
        `).run(userId, achievement.id, 100)
        
        // Add points
        db.prepare(`
          UPDATE user_stats SET total_points = total_points + ? WHERE user_id = ?
        `).run(achievement.points, userId)
        
        newAchievements.push(achievement)
      }
    }
    
    return newAchievements
  } catch (error) {
    console.error('Error checking achievements:', error)
    return []
  }
}

// Get user achievements
router.get('/user/:userId', async (req, res) => {
  try {
    const db = getDatabase()
    const userId = parseInt(req.params.userId)
    
    const achievements = db.prepare(`
      SELECT 
        a.*,
        ua.earned_at,
        ua.progress,
        CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END as earned
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
      ORDER BY a.category, a.requirement_value
    `).all(userId)
    
    const userStats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId)
    
    res.json({
      achievements,
      stats: userStats || {
        posts_count: 0,
        comments_count: 0,
        likes_received: 0,
        followers_count: 0,
        total_points: 0,
        level: 1,
        xp: 0,
        streak_days: 0
      }
    })
  } catch (error) {
    console.error('Get achievements error:', error)
    res.status(500).json({ error: 'Failed to get achievements' })
  }
})

// Get current user achievements
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    // Check for new achievements
    checkAchievements(db, userId)
    
    const achievements = db.prepare(`
      SELECT 
        a.*,
        ua.earned_at,
        ua.progress,
        CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END as earned
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
      ORDER BY ua.earned_at DESC, a.category, a.requirement_value
    `).all(userId)
    
    const userStats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId)
    
    res.json({
      achievements,
      stats: userStats || {
        posts_count: 0,
        comments_count: 0,
        likes_received: 0,
        followers_count: 0,
        total_points: 0,
        level: 1,
        xp: 0,
        streak_days: 0
      }
    })
  } catch (error) {
    console.error('Get my achievements error:', error)
    res.status(500).json({ error: 'Failed to get achievements' })
  }
})

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const db = getDatabase()
    const { type = 'points', limit = 50 } = req.query
    
    let orderBy = 'total_points DESC'
    if (type === 'posts') orderBy = 'posts_count DESC'
    if (type === 'followers') orderBy = 'followers_count DESC'
    if (type === 'level') orderBy = 'level DESC, xp DESC'
    
    const leaderboard = db.prepare(`
      SELECT 
        us.*,
        u.username,
        u.avatar_url,
        up.display_name,
        (SELECT COUNT(*) FROM user_achievements WHERE user_id = us.user_id) as achievements_count
      FROM user_stats us
      JOIN users u ON us.user_id = u.id
      LEFT JOIN user_profiles up ON us.user_id = up.user_id
      ORDER BY ${orderBy}
      LIMIT ?
    `).all(parseInt(limit))
    
    res.json(leaderboard)
  } catch (error) {
    console.error('Get leaderboard error:', error)
    res.status(500).json({ error: 'Failed to get leaderboard' })
  }
})

export default router
