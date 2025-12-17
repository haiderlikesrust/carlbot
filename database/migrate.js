import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'carl.db')

export function migrateDatabase() {
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  try {
    // Check if columns exist and add them if they don't
    const tableInfo = db.prepare("PRAGMA table_info(social_posts)").all()
    const columnNames = tableInfo.map(col => col.name)

    // Add parent_post_id if it doesn't exist
    if (!columnNames.includes('parent_post_id')) {
      console.log('Adding parent_post_id column...')
      db.prepare(`
        ALTER TABLE social_posts 
        ADD COLUMN parent_post_id INTEGER 
        REFERENCES social_posts(id) ON DELETE CASCADE
      `).run()
    }

    // Add image_url if it doesn't exist
    if (!columnNames.includes('image_url')) {
      console.log('Adding image_url column...')
      db.prepare('ALTER TABLE social_posts ADD COLUMN image_url TEXT').run()
    }

    // Add link_url if it doesn't exist
    if (!columnNames.includes('link_url')) {
      console.log('Adding link_url column...')
      db.prepare('ALTER TABLE social_posts ADD COLUMN link_url TEXT').run()
    }

    // Add link_preview if it doesn't exist
    if (!columnNames.includes('link_preview')) {
      console.log('Adding link_preview column...')
      db.prepare('ALTER TABLE social_posts ADD COLUMN link_preview TEXT').run()
    }

    // Add mentions if it doesn't exist
    if (!columnNames.includes('mentions')) {
      console.log('Adding mentions column...')
      db.prepare('ALTER TABLE social_posts ADD COLUMN mentions TEXT').run()
    }

    // Add retweets_count if it doesn't exist
    if (!columnNames.includes('retweets_count')) {
      console.log('Adding retweets_count column...')
      db.prepare('ALTER TABLE social_posts ADD COLUMN retweets_count INTEGER DEFAULT 0').run()
    }

    // Create post_shares table if it doesn't exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='post_shares'").all()
    if (tables.length === 0) {
      console.log('Creating post_shares table...')
      db.prepare(`
        CREATE TABLE IF NOT EXISTS post_shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(post_id, user_id),
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
    }

    // Create post_retweets table if it doesn't exist
    const retweetsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='post_retweets'").all()
    if (retweetsTable.length === 0) {
      console.log('Creating post_retweets table...')
      db.prepare(`
        CREATE TABLE IF NOT EXISTS post_retweets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          original_post_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(original_post_id, user_id),
          FOREIGN KEY (original_post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
    }

    // Migrate post_comments table to support nested replies
    const commentsTableInfo = db.prepare("PRAGMA table_info(post_comments)").all()
    const commentColumnNames = commentsTableInfo.map(col => col.name)

    if (!commentColumnNames.includes('parent_comment_id')) {
      console.log('Adding parent_comment_id to post_comments...')
      db.prepare(`
        ALTER TABLE post_comments 
        ADD COLUMN parent_comment_id INTEGER 
        REFERENCES post_comments(id) ON DELETE CASCADE
      `).run()
    }

    if (!commentColumnNames.includes('likes_count')) {
      console.log('Adding likes_count to post_comments...')
      db.prepare('ALTER TABLE post_comments ADD COLUMN likes_count INTEGER DEFAULT 0').run()
    }

    // Create comment_likes table if it doesn't exist
    const commentLikesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comment_likes'").all()
    if (commentLikesTable.length === 0) {
      console.log('Creating comment_likes table...')
      db.prepare(`
        CREATE TABLE IF NOT EXISTS comment_likes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          comment_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(comment_id, user_id),
          FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
    }

    // Add new tables for high priority features
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          actor_id INTEGER,
          post_id INTEGER,
          comment_id INTEGER,
          message_id INTEGER,
          content TEXT,
          is_read INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
          FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS direct_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id INTEGER NOT NULL,
          recipient_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          is_read INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS bookmarks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          post_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, post_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS post_edit_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
        CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_id ON direct_messages(recipient_id);
        CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id ON user_follows(follower_id);
        CREATE INDEX IF NOT EXISTS idx_user_follows_following_id ON user_follows(following_id);
      `)
      console.log('✅ Created notifications, DMs, bookmarks, and edit history tables')
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('Error creating new tables:', error)
      }
    }
    
    // Add edited_at column to social_posts if it doesn't exist
    try {
      const postsTableInfo = db.prepare("PRAGMA table_info(social_posts)").all()
      const postsColumnNames = postsTableInfo.map(col => col.name)
      if (!postsColumnNames.includes('edited_at')) {
        db.prepare('ALTER TABLE social_posts ADD COLUMN edited_at DATETIME').run()
        console.log('✅ Added edited_at column to social_posts')
      }
      if (!postsColumnNames.includes('community_id')) {
        db.prepare('ALTER TABLE social_posts ADD COLUMN community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL').run()
        console.log('✅ Added community_id column to social_posts')
      }
    } catch (error) {
      if (!error.message.includes('duplicate column')) {
        console.error('Error adding columns:', error)
      }
    }

    // Create communities tables
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS communities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT,
          icon TEXT,
          banner TEXT,
          owner_id INTEGER NOT NULL,
          is_public INTEGER DEFAULT 1,
          member_count INTEGER DEFAULT 0,
          post_count INTEGER DEFAULT 0,
          rules TEXT,
          tags TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS community_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          community_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          role TEXT DEFAULT 'member',
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(community_id, user_id),
          FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);
        CREATE INDEX IF NOT EXISTS idx_communities_owner_id ON communities(owner_id);
        CREATE INDEX IF NOT EXISTS idx_community_members_community_id ON community_members(community_id);
        CREATE INDEX IF NOT EXISTS idx_community_members_user_id ON community_members(user_id);
      `)
      console.log('✅ Created communities and community_members tables')
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('Error creating communities tables:', error)
      }
    }

  // Migration to add hashtags table
  const addHashtagsTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS hashtags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tag TEXT UNIQUE NOT NULL,
          post_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
      console.log('✅ Created hashtags table')
    } catch (error) {
      console.error('❌ Error creating hashtags table:', error)
      throw error
    }
  }

  // Migration to add post_hashtags junction table
  const addPostHashtagsTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS post_hashtags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          hashtag_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(post_id, hashtag_id),
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
          FOREIGN KEY (hashtag_id) REFERENCES hashtags(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created post_hashtags table')
    } catch (error) {
      console.error('❌ Error creating post_hashtags table:', error)
      throw error
    }
  }

  // Migration to add post_reactions table
  const addPostReactionsTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS post_reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          reaction TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(post_id, user_id, reaction),
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created post_reactions table')
    } catch (error) {
      console.error('❌ Error creating post_reactions table:', error)
      throw error
    }
  }

  // Migration to add polls table
  const addPollsTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS polls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL UNIQUE,
          question TEXT NOT NULL,
          options TEXT NOT NULL,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created polls table')
    } catch (error) {
      console.error('❌ Error creating polls table:', error)
      throw error
    }
  }

  // Migration to add poll_votes table
  const addPollVotesTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS poll_votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          poll_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          option_index INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(poll_id, user_id),
          FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created poll_votes table')
    } catch (error) {
      console.error('❌ Error creating poll_votes table:', error)
      throw error
    }
  }

  // Migration to add user_online_status table
  const addOnlineStatusTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS user_online_status (
          user_id INTEGER PRIMARY KEY,
          is_online INTEGER DEFAULT 0,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created user_online_status table')
    } catch (error) {
      console.error('❌ Error creating user_online_status table:', error)
      throw error
    }
  }

  // Migration to add post_edit_history table
  const addPostEditHistoryTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS post_edit_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created post_edit_history table')
    } catch (error) {
      console.error('❌ Error creating post_edit_history table:', error)
      throw error
    }
  }

  // Migration to add is_edited flag to social_posts
  const addIsEditedToPosts = (db) => {
    try {
      db.prepare('ALTER TABLE social_posts ADD COLUMN is_edited INTEGER DEFAULT 0').run()
      console.log('✅ Added is_edited column to social_posts table')
    } catch (error) {
      if (error.message.includes('duplicate column name: is_edited')) {
        console.log('ℹ️ is_edited column already exists in social_posts table, skipping migration.')
      } else {
        console.error('❌ Error adding is_edited to social_posts:', error)
        throw error
      }
    }
  }

  addHashtagsTable(db)
  addPostHashtagsTable(db)
  addPostReactionsTable(db)
  addPollsTable(db)
  addPollVotesTable(db)
  addOnlineStatusTable(db)
  addPostEditHistoryTable(db)
  addIsEditedToPosts(db)

  // Migration to add bot activity log table
  const addBotActivityLogTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS bot_activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bot_user_id INTEGER NOT NULL,
          action_type TEXT NOT NULL,
          action_details TEXT,
          target_type TEXT,
          target_id INTEGER,
          success INTEGER DEFAULT 1,
          error_message TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (bot_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      db.prepare('CREATE INDEX IF NOT EXISTS idx_bot_activity_log_bot_user_id ON bot_activity_log(bot_user_id)').run()
      db.prepare('CREATE INDEX IF NOT EXISTS idx_bot_activity_log_created_at ON bot_activity_log(created_at)').run()
      db.prepare('CREATE INDEX IF NOT EXISTS idx_bot_activity_log_action_type ON bot_activity_log(action_type)').run()
      console.log('✅ Created bot_activity_log table')
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('❌ Error creating bot_activity_log table:', error)
      }
    }
  }

  // Migration to add bot config table
  const addBotConfigTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS bot_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          config_key TEXT UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          description TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_by INTEGER,
          FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      
      // Insert default config if it doesn't exist
      const defaultConfig = db.prepare('SELECT config_key FROM bot_config WHERE config_key = ?').get('system_prompt')
      if (!defaultConfig) {
        const defaultPrompt = `You are Carl, a hardcore gaming strategist and pro player. You're brutally honest, sarcastic, and tactical. You know everything about competitive gaming, meta builds, strategies, and game mechanics. Keep responses SHORT and punchy (30-60 words max). Never break character. Give tactical gaming advice, not generic tips.

CRITICAL: When discussing trending posts or social feed content, you MUST accurately summarize the ACTUAL content provided. Read the exact post content and reflect what it actually says. Do NOT make up generic meta summaries or assume what posts contain.`
        
        db.prepare(`
          INSERT INTO bot_config (config_key, config_value, description)
          VALUES 
            ('system_prompt', ?, 'Main system prompt for Carlbot AI personality'),
            ('auto_interact_enabled', 'true', 'Enable automatic interactions with posts'),
            ('auto_comment_enabled', 'true', 'Enable automatic commenting (default: ON)'),
            ('create_posts_enabled', 'true', 'Enable automatic post creation'),
            ('interaction_rate', '0.2', 'Probability of creating original posts per run'),
            ('max_interactions_per_run', '5', 'Maximum interactions per automation run'),
            ('comment_max_length', '50', 'Maximum words in comments'),
            ('post_max_length', '150', 'Maximum words in posts'),
            ('scheduler_interval_minutes', '30', 'Minutes between automated runs')
        `).run(defaultPrompt)
      }
      
      console.log('✅ Created bot_config table')
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('❌ Error creating bot_config table:', error)
      }
    }
  }

  addBotActivityLogTable(db)
  addBotConfigTable(db)

  // Migration to add admin users table
  const addAdminUsersTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          email TEXT UNIQUE,
          is_active INTEGER DEFAULT 1,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
      db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username)').run()
      console.log('✅ Created admin_users table')
      
      // Note: Default admin should be created via script (scripts/create-admin.js)
      // We don't create it automatically for security
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('❌ Error creating admin_users table:', error)
      }
    }
  }

  addAdminUsersTable(db)

  // Migration to add achievements system
  const addAchievementsTables = (db) => {
    try {
      // Achievements definition table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS achievements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          category TEXT,
          requirement_type TEXT NOT NULL,
          requirement_value INTEGER NOT NULL,
          points INTEGER DEFAULT 0,
          rarity TEXT DEFAULT 'common',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
      
      // User achievements (earned badges)
      db.prepare(`
        CREATE TABLE IF NOT EXISTS user_achievements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          achievement_id INTEGER NOT NULL,
          earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          progress INTEGER DEFAULT 100,
          UNIQUE(user_id, achievement_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
        )
      `).run()
      
      // User stats for achievement tracking
      db.prepare(`
        CREATE TABLE IF NOT EXISTS user_stats (
          user_id INTEGER PRIMARY KEY,
          posts_count INTEGER DEFAULT 0,
          comments_count INTEGER DEFAULT 0,
          likes_received INTEGER DEFAULT 0,
          followers_count INTEGER DEFAULT 0,
          following_count INTEGER DEFAULT 0,
          total_points INTEGER DEFAULT 0,
          level INTEGER DEFAULT 1,
          xp INTEGER DEFAULT 0,
          streak_days INTEGER DEFAULT 0,
          last_activity_date DATE,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      
      // Insert default achievements
      const existingAchievements = db.prepare('SELECT COUNT(*) as count FROM achievements').get()
      if (existingAchievements.count === 0) {
        const defaultAchievements = [
          { code: 'first_post', name: 'First Post', description: 'Share your first post', icon: '📝', category: 'content', type: 'posts', value: 1, points: 10, rarity: 'common' },
          { code: 'ten_posts', name: 'Getting Started', description: 'Create 10 posts', icon: '📚', category: 'content', type: 'posts', value: 10, points: 50, rarity: 'common' },
          { code: 'hundred_posts', name: 'Content Creator', description: 'Create 100 posts', icon: '🎨', category: 'content', type: 'posts', value: 100, points: 500, rarity: 'rare' },
          { code: 'first_comment', name: 'First Comment', description: 'Leave your first comment', icon: '💬', category: 'social', type: 'comments', value: 1, points: 5, rarity: 'common' },
          { code: 'hundred_likes', name: 'Popular', description: 'Receive 100 likes', icon: '🔥', category: 'social', type: 'likes_received', value: 100, points: 200, rarity: 'rare' },
          { code: 'ten_followers', name: 'Rising Star', description: 'Get 10 followers', icon: '⭐', category: 'social', type: 'followers', value: 10, points: 100, rarity: 'common' },
          { code: 'hundred_followers', name: 'Influencer', description: 'Get 100 followers', icon: '👑', category: 'social', type: 'followers', value: 100, points: 1000, rarity: 'epic' },
          { code: 'week_streak', name: 'Dedicated', description: '7 day activity streak', icon: '🔥', category: 'engagement', type: 'streak', value: 7, points: 150, rarity: 'rare' },
          { code: 'month_streak', name: 'Consistent', description: '30 day activity streak', icon: '💪', category: 'engagement', type: 'streak', value: 30, points: 1000, rarity: 'epic' },
          { code: 'level_10', name: 'Level 10', description: 'Reach level 10', icon: '🎯', category: 'progression', type: 'level', value: 10, points: 500, rarity: 'rare' },
          { code: 'level_25', name: 'Level 25', description: 'Reach level 25', icon: '🏆', category: 'progression', type: 'level', value: 25, points: 2000, rarity: 'epic' },
          { code: 'level_50', name: 'Master', description: 'Reach level 50', icon: '🌟', category: 'progression', type: 'level', value: 50, points: 5000, rarity: 'legendary' }
        ]
        
        const insertStmt = db.prepare(`
          INSERT INTO achievements (code, name, description, icon, category, requirement_type, requirement_value, points, rarity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        
        for (const ach of defaultAchievements) {
          insertStmt.run(ach.code, ach.name, ach.description, ach.icon, ach.category, ach.type, ach.value, ach.points, ach.rarity)
        }
      }
      
      db.prepare('CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id)').run()
      db.prepare('CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id)').run()
      db.prepare('CREATE INDEX IF NOT EXISTS idx_achievements_code ON achievements(code)').run()
      
      console.log('✅ Created achievements system tables')
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('❌ Error creating achievements tables:', error)
      }
    }
  }

  addAchievementsTables(db)

  // Migration to add scheduler status table
  const addSchedulerStatusTable = (db) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS scheduler_status (
          id INTEGER PRIMARY KEY,
          last_run DATETIME,
          next_run DATETIME,
          interval_minutes INTEGER DEFAULT 30,
          is_running INTEGER DEFAULT 0,
          last_run_result TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
      
      // Initialize scheduler status
      const existing = db.prepare('SELECT id FROM scheduler_status WHERE id = 1').get()
      if (!existing) {
        const nextRun = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
        db.prepare(`
          INSERT INTO scheduler_status (id, next_run, interval_minutes)
          VALUES (1, ?, 30)
        `).run(nextRun.toISOString())
      }
      
      console.log('✅ Created scheduler_status table')
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('❌ Error creating scheduler_status table:', error)
      }
    }
  }

  addSchedulerStatusTable(db)

  // Migration to add moderation columns
  const addModerationColumns = (db) => {
    try {
      // Add is_banned to users table
      const usersInfo = db.prepare("PRAGMA table_info(users)").all()
      const usersColumns = usersInfo.map(col => col.name)
      
      if (!usersColumns.includes('is_banned')) {
        db.prepare('ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0').run()
        console.log('✅ Added is_banned column to users table')
      }

      // Add moderation columns to social_posts
      const postsInfo = db.prepare("PRAGMA table_info(social_posts)").all()
      const postsColumns = postsInfo.map(col => col.name)
      
      if (!postsColumns.includes('is_deleted')) {
        db.prepare('ALTER TABLE social_posts ADD COLUMN is_deleted INTEGER DEFAULT 0').run()
        console.log('✅ Added is_deleted column to social_posts table')
      }
      
      if (!postsColumns.includes('deleted_by')) {
        db.prepare('ALTER TABLE social_posts ADD COLUMN deleted_by TEXT').run()
        console.log('✅ Added deleted_by column to social_posts table')
      }
      
      if (!postsColumns.includes('deleted_reason')) {
        db.prepare('ALTER TABLE social_posts ADD COLUMN deleted_reason TEXT').run()
        console.log('✅ Added deleted_reason column to social_posts table')
      }

      // Add moderation columns to post_comments
      const commentsInfo = db.prepare("PRAGMA table_info(post_comments)").all()
      const commentsColumns = commentsInfo.map(col => col.name)
      
      if (!commentsColumns.includes('is_deleted')) {
        db.prepare('ALTER TABLE post_comments ADD COLUMN is_deleted INTEGER DEFAULT 0').run()
        console.log('✅ Added is_deleted column to post_comments table')
      }
      
      if (!commentsColumns.includes('deleted_by')) {
        db.prepare('ALTER TABLE post_comments ADD COLUMN deleted_by TEXT').run()
        console.log('✅ Added deleted_by column to post_comments table')
      }
      
      if (!commentsColumns.includes('deleted_reason')) {
        db.prepare('ALTER TABLE post_comments ADD COLUMN deleted_reason TEXT').run()
        console.log('✅ Added deleted_reason column to post_comments table')
      }
    } catch (error) {
      if (!error.message.includes('duplicate column')) {
        console.error('❌ Error adding moderation columns:', error)
      }
    }
  }

  addModerationColumns(db)

  // Add tables for new features
  function addNewFeatureTables(db) {
    try {
      // Edit history table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS post_edit_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created post_edit_history table')

      // Blocked users table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS blocked_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          blocked_user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, blocked_user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created blocked_users table')

      // Muted users table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS muted_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          muted_user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, muted_user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (muted_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created muted_users table')

      // Build comparisons table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS build_comparisons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          build1_id INTEGER NOT NULL,
          build2_id INTEGER NOT NULL,
          comparison_data TEXT, -- JSON with comparison details
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      console.log('✅ Created build_comparisons table')

      // Add edited_at column to social_posts if it doesn't exist
      const postsColumns = db.prepare("PRAGMA table_info(social_posts)").all().map(col => col.name)
      if (!postsColumns.includes('edited_at')) {
        db.prepare('ALTER TABLE social_posts ADD COLUMN edited_at DATETIME').run()
        console.log('✅ Added edited_at column to social_posts')
      }

      // Add edit_count column to social_posts if it doesn't exist
      if (!postsColumns.includes('edit_count')) {
        db.prepare('ALTER TABLE social_posts ADD COLUMN edit_count INTEGER DEFAULT 0').run()
        console.log('✅ Added edit_count column to social_posts')
      }
    } catch (error) {
      if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
        console.error('❌ Error adding new feature tables:', error)
      }
    }
  }

  addNewFeatureTables(db)

  console.log('✅ Database migration completed successfully')
} catch (error) {
    console.error('Migration error:', error)
    throw error
  } finally {
    db.close()
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase()
  
  // Also run Discord features migration
  try {
    const { migrateDiscordFeatures } = await import('./migrate-discord-features.js')
    migrateDiscordFeatures()
  } catch (error) {
    console.error('Failed to run Discord features migration:', error.message)
  }
}

