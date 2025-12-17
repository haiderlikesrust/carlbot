import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'carl.db')

export function migrateDiscordFeatures() {
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  try {
    console.log('🔄 Starting Discord features migration...')
    let executed = 0

    // Helper to check if column exists
    const columnExists = (tableName, columnName) => {
      try {
        const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all()
        return tableInfo.some(col => col.name === columnName)
      } catch {
        return false
      }
    }

    // Helper to check if table exists
    const tableExists = (tableName) => {
      try {
        const result = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(tableName)
        return !!result
      } catch {
        return false
      }
    }

    // Helper to check if index exists
    const indexExists = (indexName) => {
      try {
        const result = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
        ).get(indexName)
        return !!result
      } catch {
        return false
      }
    }

    // ============================================
    // Add server columns to communities table
    // ============================================
    const serverColumns = [
      { name: 'server_type', def: "TEXT DEFAULT 'community'" },
      { name: 'server_icon', def: 'TEXT' },
      { name: 'server_banner', def: 'TEXT' },
      { name: 'verification_level', def: 'INTEGER DEFAULT 0' },
      { name: 'default_notifications', def: "TEXT DEFAULT 'all'" },
      { name: 'afk_timeout', def: 'INTEGER DEFAULT 300' },
      { name: 'afk_channel_id', def: 'INTEGER' },
      { name: 'system_channel_id', def: 'INTEGER' },
      { name: 'rules_channel_id', def: 'INTEGER' },
      { name: 'public_updates_channel_id', def: 'INTEGER' },
      { name: 'boost_level', def: 'INTEGER DEFAULT 0' },
      { name: 'boost_count', def: 'INTEGER DEFAULT 0' },
      { name: 'premium_tier', def: 'INTEGER DEFAULT 0' },
      { name: 'vanity_url', def: 'TEXT' },
      { name: 'widget_enabled', def: 'INTEGER DEFAULT 0' },
      { name: 'widget_channel_id', def: 'INTEGER' },
      { name: 'safety_alerts_channel_id', def: 'INTEGER' },
      { name: 'nsfw', def: 'INTEGER DEFAULT 0' },
      { name: 'nsfw_level', def: 'INTEGER DEFAULT 0' }
    ]

    for (const col of serverColumns) {
      if (!columnExists('communities', col.name)) {
        try {
          db.prepare(`ALTER TABLE communities ADD COLUMN ${col.name} ${col.def}`).run()
          executed++
          console.log(`  ✅ Added column: communities.${col.name}`)
        } catch (error) {
          if (!error.message.includes('duplicate column')) {
            console.error(`  ⚠️ Failed to add column ${col.name}:`, error.message)
          }
        }
      }
    }

    // ============================================
    // Create Channels table
    // ============================================
    if (!tableExists('channels')) {
      db.prepare(`
        CREATE TABLE channels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'text',
          position INTEGER DEFAULT 0,
          topic TEXT,
          nsfw INTEGER DEFAULT 0,
          bitrate INTEGER,
          user_limit INTEGER,
          rate_limit_per_user INTEGER DEFAULT 0,
          parent_id INTEGER,
          permissions_overwrites TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_id) REFERENCES channels(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: channels')
    }

    if (!indexExists('idx_channels_server_id')) {
      db.prepare('CREATE INDEX idx_channels_server_id ON channels(server_id)').run()
      executed++
    }
    if (!indexExists('idx_channels_type')) {
      db.prepare('CREATE INDEX idx_channels_type ON channels(type)').run()
      executed++
    }

    // ============================================
    // Create Server Roles table
    // ============================================
    if (!tableExists('server_roles')) {
      db.prepare(`
        CREATE TABLE server_roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          color TEXT DEFAULT '#000000',
          hoist INTEGER DEFAULT 0,
          mentionable INTEGER DEFAULT 0,
          position INTEGER DEFAULT 0,
          permissions TEXT,
          icon TEXT,
          unicode_emoji TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: server_roles')
    }

    // ============================================
    // Create Role Members table
    // ============================================
    if (!tableExists('server_role_members')) {
      db.prepare(`
        CREATE TABLE server_role_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          role_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(server_id, user_id, role_id),
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: server_role_members')
    }

    // ============================================
    // Create Channel Messages table
    // ============================================
    if (!tableExists('channel_messages')) {
      db.prepare(`
        CREATE TABLE channel_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          content TEXT,
          nonce TEXT,
          tts INTEGER DEFAULT 0,
          mention_everyone INTEGER DEFAULT 0,
          pinned INTEGER DEFAULT 0,
          edited_at DATETIME,
          attachments TEXT,
          embeds TEXT,
          mentions TEXT,
          mention_roles TEXT,
          reactions TEXT,
          message_type INTEGER DEFAULT 0,
          flags INTEGER DEFAULT 0,
          referenced_message_id INTEGER,
          thread_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (referenced_message_id) REFERENCES channel_messages(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: channel_messages')
    }

    // ============================================
    // Create Threads table
    // ============================================
    if (!tableExists('threads')) {
      db.prepare(`
        CREATE TABLE threads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id INTEGER NOT NULL,
          parent_message_id INTEGER,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'public_thread',
          archived INTEGER DEFAULT 0,
          auto_archive_duration INTEGER DEFAULT 60,
          locked INTEGER DEFAULT 0,
          invitable INTEGER DEFAULT 1,
          member_count INTEGER DEFAULT 0,
          message_count INTEGER DEFAULT 0,
          rate_limit_per_user INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          archived_at DATETIME,
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_message_id) REFERENCES channel_messages(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: threads')
    }

    // ============================================
    // Create Thread Members table
    // ============================================
    if (!tableExists('thread_members')) {
      db.prepare(`
        CREATE TABLE thread_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(thread_id, user_id),
          FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: thread_members')
    }

    // ============================================
    // Create Message Reactions table
    // ============================================
    if (!tableExists('message_reactions')) {
      db.prepare(`
        CREATE TABLE message_reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER NOT NULL,
          emoji_name TEXT NOT NULL,
          emoji_id TEXT,
          emoji_animated INTEGER DEFAULT 0,
          count INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(message_id, emoji_name, emoji_id),
          FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: message_reactions')
    }

    // ============================================
    // Create Reaction Users table
    // ============================================
    if (!tableExists('reaction_users')) {
      db.prepare(`
        CREATE TABLE reaction_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reaction_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(reaction_id, user_id),
          FOREIGN KEY (reaction_id) REFERENCES message_reactions(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: reaction_users')
    }

    // ============================================
    // Create Custom Emojis table
    // ============================================
    if (!tableExists('custom_emojis')) {
      db.prepare(`
        CREATE TABLE custom_emojis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: custom_emojis')
    } else {
      // Add missing columns if table exists but columns are missing
      if (!columnExists('custom_emojis', 'url')) {
        try {
          db.prepare('ALTER TABLE custom_emojis ADD COLUMN url TEXT').run()
          // Migrate image_url to url if it exists
          if (columnExists('custom_emojis', 'image_url')) {
            db.prepare('UPDATE custom_emojis SET url = image_url WHERE url IS NULL').run()
          }
          executed++
          console.log('  ✅ Added column: custom_emojis.url')
        } catch (error) {
          if (!error.message.includes('duplicate column')) {
            console.error('  ⚠️ Failed to add url column:', error.message)
          }
        }
      }
      if (!columnExists('custom_emojis', 'created_by')) {
        try {
          db.prepare('ALTER TABLE custom_emojis ADD COLUMN created_by INTEGER').run()
          executed++
          console.log('  ✅ Added column: custom_emojis.created_by')
        } catch (error) {
          if (!error.message.includes('duplicate column')) {
            console.error('  ⚠️ Failed to add created_by column:', error.message)
          }
        }
      }
    }

    // ============================================
    // Create Stickers table
    // ============================================
    if (!tableExists('stickers')) {
      db.prepare(`
        CREATE TABLE stickers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          name TEXT NOT NULL,
          description TEXT,
          tags TEXT,
          type INTEGER DEFAULT 1,
          format_type INTEGER DEFAULT 1,
          image_url TEXT NOT NULL,
          available INTEGER DEFAULT 1,
          sort_value INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: stickers')
    }

    // ============================================
    // Create Group DMs table
    // ============================================
    if (!tableExists('group_dms')) {
      db.prepare(`
        CREATE TABLE group_dms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          icon TEXT,
          owner_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: group_dms')
    }

    // ============================================
    // Create Group DM Members table
    // ============================================
    if (!tableExists('group_dm_members')) {
      db.prepare(`
        CREATE TABLE group_dm_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_dm_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(group_dm_id, user_id),
          FOREIGN KEY (group_dm_id) REFERENCES group_dms(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: group_dm_members')
    }

    // ============================================
    // Create Group DM Messages table
    // ============================================
    if (!tableExists('group_dm_messages')) {
      db.prepare(`
        CREATE TABLE group_dm_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_dm_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          content TEXT,
          attachments TEXT,
          embeds TEXT,
          mentions TEXT,
          pinned INTEGER DEFAULT 0,
          edited_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (group_dm_id) REFERENCES group_dms(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: group_dm_messages')
    }

    // ============================================
    // Create Friendships table
    // ============================================
    if (!tableExists('friendships')) {
      db.prepare(`
        CREATE TABLE friendships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          friend_id INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, friend_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
          CHECK(user_id != friend_id)
        )
      `).run()
      executed++
      console.log('  ✅ Created table: friendships')
    }

    // ============================================
    // Create Activity Status table
    // ============================================
    if (!tableExists('user_activity_status')) {
      db.prepare(`
        CREATE TABLE user_activity_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          status TEXT DEFAULT 'offline',
          custom_status TEXT,
          game_name TEXT,
          game_type INTEGER,
          game_url TEXT,
          since DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: user_activity_status')
    }

    // ============================================
    // Create Voice States table
    // ============================================
    if (!tableExists('voice_states')) {
      db.prepare(`
        CREATE TABLE voice_states (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          channel_id INTEGER,
          user_id INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          deaf INTEGER DEFAULT 0,
          mute INTEGER DEFAULT 0,
          self_deaf INTEGER DEFAULT 0,
          self_mute INTEGER DEFAULT 0,
          self_stream INTEGER DEFAULT 0,
          self_video INTEGER DEFAULT 0,
          suppress INTEGER DEFAULT 0,
          request_to_speak_timestamp DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, session_id),
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: voice_states')
    }

    // ============================================
    // Create Stage Instances table
    // ============================================
    if (!tableExists('stage_instances')) {
      db.prepare(`
        CREATE TABLE stage_instances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id INTEGER NOT NULL,
          topic TEXT,
          privacy_level INTEGER DEFAULT 1,
          discoverable_disabled INTEGER DEFAULT 0,
          scheduled_event_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: stage_instances')
    }

    // ============================================
    // Create Scheduled Events table
    // ============================================
    if (!tableExists('scheduled_events')) {
      db.prepare(`
        CREATE TABLE scheduled_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          channel_id INTEGER,
          creator_id INTEGER,
          name TEXT NOT NULL,
          description TEXT,
          scheduled_start_time DATETIME NOT NULL,
          scheduled_end_time DATETIME,
          privacy_level INTEGER DEFAULT 2,
          status INTEGER DEFAULT 1,
          entity_type INTEGER DEFAULT 1,
          entity_id INTEGER,
          entity_metadata TEXT,
          user_count INTEGER DEFAULT 0,
          image TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
          FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: scheduled_events')
    }

    // ============================================
    // Create Event Users table
    // ============================================
    if (!tableExists('event_users')) {
      db.prepare(`
        CREATE TABLE event_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(event_id, user_id),
          FOREIGN KEY (event_id) REFERENCES scheduled_events(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: event_users')
    }

    // ============================================
    // Create Webhooks table
    // ============================================
    if (!tableExists('webhooks')) {
      db.prepare(`
        CREATE TABLE webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          channel_id INTEGER,
          user_id INTEGER,
          name TEXT NOT NULL,
          avatar TEXT,
          token TEXT NOT NULL,
          type INTEGER DEFAULT 1,
          application_id INTEGER,
          url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: webhooks')
    }

    // ============================================
    // Create Integrations table
    // ============================================
    if (!tableExists('integrations')) {
      db.prepare(`
        CREATE TABLE integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          syncing INTEGER DEFAULT 0,
          role_id INTEGER,
          enable_emoticons INTEGER DEFAULT 0,
          expire_behavior INTEGER DEFAULT 0,
          expire_grace_period INTEGER,
          user_id INTEGER,
          account TEXT,
          synced_at DATETIME,
          subscriber_count INTEGER DEFAULT 0,
          revoked INTEGER DEFAULT 0,
          application_id INTEGER,
          scopes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE SET NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: integrations')
    }

    // ============================================
    // Create Slash Commands table
    // ============================================
    if (!tableExists('slash_commands')) {
      db.prepare(`
        CREATE TABLE slash_commands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          application_id INTEGER,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          options TEXT,
          default_permission INTEGER DEFAULT 1,
          type INTEGER DEFAULT 1,
          version TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: slash_commands')
    }

    // ============================================
    // Create Pinned Messages table
    // ============================================
    if (!tableExists('pinned_messages')) {
      db.prepare(`
        CREATE TABLE pinned_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id INTEGER NOT NULL,
          message_id INTEGER NOT NULL,
          pinned_by INTEGER NOT NULL,
          pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(channel_id, message_id),
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
          FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE,
          FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: pinned_messages')
    }

    // ============================================
    // Create File Attachments table
    // ============================================
    if (!tableExists('file_attachments')) {
      db.prepare(`
        CREATE TABLE file_attachments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER,
          user_id INTEGER NOT NULL,
          filename TEXT NOT NULL,
          content_type TEXT,
          size INTEGER,
          url TEXT NOT NULL,
          proxy_url TEXT,
          width INTEGER,
          height INTEGER,
          ephemeral INTEGER DEFAULT 0,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: file_attachments')
    }

    // ============================================
    // Create Nitro Subscriptions table
    // ============================================
    if (!tableExists('nitro_subscriptions')) {
      db.prepare(`
        CREATE TABLE nitro_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          tier INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          payment_method TEXT,
          auto_renew INTEGER DEFAULT 1,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: nitro_subscriptions')
    }

    // ============================================
    // Create Server Boosts table
    // ============================================
    if (!tableExists('server_boosts')) {
      db.prepare(`
        CREATE TABLE server_boosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          boost_count INTEGER DEFAULT 1,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: server_boosts')
    }

    // ============================================
    // Create Server Invites table
    // ============================================
    if (!tableExists('server_invites')) {
      db.prepare(`
        CREATE TABLE server_invites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          code TEXT NOT NULL UNIQUE,
          created_by INTEGER NOT NULL,
          max_uses INTEGER,
          uses INTEGER DEFAULT 0,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: server_invites')
    }

    if (!indexExists('idx_server_invites_code')) {
      db.prepare('CREATE INDEX idx_server_invites_code ON server_invites(code)').run()
      executed++
    }
    if (!indexExists('idx_server_invites_server_id')) {
      db.prepare('CREATE INDEX idx_server_invites_server_id ON server_invites(server_id)').run()
      executed++
    }

    // ============================================
    // Create Read States table
    // ============================================
    if (!tableExists('read_states')) {
      db.prepare(`
        CREATE TABLE read_states (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          channel_id INTEGER,
          group_dm_id INTEGER,
          last_message_id INTEGER,
          last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          mention_count INTEGER DEFAULT 0,
          UNIQUE(user_id, channel_id, group_dm_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
          FOREIGN KEY (group_dm_id) REFERENCES group_dms(id) ON DELETE CASCADE
        )
      `).run()
      executed++
      console.log('  ✅ Created table: read_states')
    }

    // Add foreign key for thread_id in channel_messages if table exists
    if (tableExists('channel_messages') && !columnExists('channel_messages', 'thread_id')) {
      try {
        db.prepare('ALTER TABLE channel_messages ADD COLUMN thread_id INTEGER REFERENCES threads(id) ON DELETE SET NULL').run()
        executed++
        console.log('  ✅ Added thread_id to channel_messages')
      } catch (error) {
        if (!error.message.includes('duplicate column')) {
          console.error('  ⚠️ Failed to add thread_id:', error.message)
        }
      }
    }

    // ============================================
    // Add notification columns for Carlcord mentions
    // ============================================
    if (tableExists('notifications')) {
      if (!columnExists('notifications', 'channel_id')) {
        try {
          db.prepare('ALTER TABLE notifications ADD COLUMN channel_id INTEGER').run()
          executed++
          console.log('  ✅ Added column: notifications.channel_id')
        } catch (error) {
          if (!error.message.includes('duplicate column')) {
            console.error('  ⚠️ Failed to add channel_id column:', error.message)
          }
        }
      }
      if (!columnExists('notifications', 'server_id')) {
        try {
          db.prepare('ALTER TABLE notifications ADD COLUMN server_id INTEGER').run()
          executed++
          console.log('  ✅ Added column: notifications.server_id')
        } catch (error) {
          if (!error.message.includes('duplicate column')) {
            console.error('  ⚠️ Failed to add server_id column:', error.message)
          }
        }
      }
      if (!columnExists('notifications', 'is_everyone')) {
        try {
          db.prepare('ALTER TABLE notifications ADD COLUMN is_everyone INTEGER DEFAULT 0').run()
          executed++
          console.log('  ✅ Added column: notifications.is_everyone')
        } catch (error) {
          if (!error.message.includes('duplicate column')) {
            console.error('  ⚠️ Failed to add is_everyone column:', error.message)
          }
        }
      }
    }

    // ============================================
    // Auto-Moderation Rules Table
    // ============================================
    if (!tableExists('auto_moderation_rules')) {
      db.prepare(`
        CREATE TABLE auto_moderation_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          rule_type TEXT NOT NULL,
          trigger_count INTEGER DEFAULT 5,
          trigger_timeframe INTEGER DEFAULT 60,
          action_type TEXT NOT NULL,
          action_duration INTEGER,
          exempt_roles TEXT,
          exempt_channels TEXT,
          word_filter TEXT,
          spam_detection INTEGER DEFAULT 1,
          mention_spam INTEGER DEFAULT 1,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: auto_moderation_rules')
    }

    // ============================================
    // Audit Logs Table
    // ============================================
    if (!tableExists('audit_logs')) {
      db.prepare(`
        CREATE TABLE audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          action_type TEXT NOT NULL,
          target_type TEXT,
          target_id INTEGER,
          target_name TEXT,
          reason TEXT,
          changes TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: audit_logs')
    }

    // ============================================
    // Moderation Actions Table (for tracking)
    // ============================================
    if (!tableExists('moderation_actions')) {
      db.prepare(`
        CREATE TABLE moderation_actions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          action_type TEXT NOT NULL,
          reason TEXT,
          duration INTEGER,
          expires_at DATETIME,
          created_by INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `).run()
      executed++
      console.log('  ✅ Created table: moderation_actions')
    }

    console.log(`\n✅ Discord features migration completed! (${executed} operations)`)
    return true
  } catch (error) {
    console.error('❌ Discord features migration failed:', error)
    return false
  } finally {
    db.close()
  }
}

// Run if called directly
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  migrateDiscordFeatures()
} else if (process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'))) {
  migrateDiscordFeatures()
} else {
  // Try to run anyway if this is the main module
  const isMainModule = import.meta.url.endsWith('migrate-discord-features.js') || 
                       import.meta.url.includes('migrate-discord-features')
  if (isMainModule) {
    migrateDiscordFeatures()
  }
}
