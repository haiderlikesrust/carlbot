-- Discord-like Features Database Schema
-- This migration adds all Discord-like features: servers, channels, roles, permissions, etc.

-- ============================================
-- SERVERS (Enhanced Communities)
-- ============================================
-- Add server-specific columns to communities table
ALTER TABLE communities ADD COLUMN IF NOT EXISTS server_type TEXT DEFAULT 'community'; -- 'community', 'gaming', 'public', 'private'
ALTER TABLE communities ADD COLUMN IF NOT EXISTS server_icon TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS server_banner TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS verification_level INTEGER DEFAULT 0; -- 0=none, 1=low, 2=medium, 3=high, 4=very_high
ALTER TABLE communities ADD COLUMN IF NOT EXISTS default_notifications TEXT DEFAULT 'all'; -- 'all', 'mentions', 'none'
ALTER TABLE communities ADD COLUMN IF NOT EXISTS afk_timeout INTEGER DEFAULT 300; -- seconds
ALTER TABLE communities ADD COLUMN IF NOT EXISTS afk_channel_id INTEGER;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS system_channel_id INTEGER;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS rules_channel_id INTEGER;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS public_updates_channel_id INTEGER;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS boost_level INTEGER DEFAULT 0; -- 0, 1, 2, 3
ALTER TABLE communities ADD COLUMN IF NOT EXISTS boost_count INTEGER DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS premium_tier INTEGER DEFAULT 0; -- 0, 1, 2, 3
ALTER TABLE communities ADD COLUMN IF NOT EXISTS vanity_url TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS widget_enabled INTEGER DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS widget_channel_id INTEGER;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS safety_alerts_channel_id INTEGER;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS nsfw INTEGER DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS nsfw_level INTEGER DEFAULT 0; -- 0=safe, 1=age_restricted, 2=explicit

-- ============================================
-- CHANNELS
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL, -- References communities.id
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text', -- 'text', 'voice', 'video', 'stage', 'announcement', 'forum', 'thread'
    position INTEGER DEFAULT 0,
    topic TEXT,
    nsfw INTEGER DEFAULT 0,
    bitrate INTEGER, -- For voice channels (in kbps)
    user_limit INTEGER, -- For voice channels (0 = unlimited)
    rate_limit_per_user INTEGER DEFAULT 0, -- Slow mode (seconds)
    parent_id INTEGER, -- Category channel
    permissions_overwrites TEXT, -- JSON array of permission overwrites
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES channels(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_parent_id ON channels(parent_id);

-- ============================================
-- ROLES
-- ============================================
CREATE TABLE IF NOT EXISTS server_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#000000',
    hoist INTEGER DEFAULT 0, -- Display separately in member list
    mentionable INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    permissions TEXT, -- JSON object with permission flags
    icon TEXT,
    unicode_emoji TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_roles_server_id ON server_roles(server_id);

-- ============================================
-- ROLE MEMBERS (User-Role Assignments)
-- ============================================
CREATE TABLE IF NOT EXISTS server_role_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_id, user_id, role_id),
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_role_members_server_user ON server_role_members(server_id, user_id);
CREATE INDEX IF NOT EXISTS idx_role_members_role_id ON server_role_members(role_id);

-- ============================================
-- CHANNEL MESSAGES (Enhanced from social_posts)
-- ============================================
CREATE TABLE IF NOT EXISTS channel_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT,
    nonce TEXT, -- For message deduplication
    tts INTEGER DEFAULT 0, -- Text-to-speech
    mention_everyone INTEGER DEFAULT 0,
    pinned INTEGER DEFAULT 0,
    edited_at DATETIME,
    attachments TEXT, -- JSON array of attachments
    embeds TEXT, -- JSON array of embeds
    mentions TEXT, -- JSON array of mentioned user IDs
    mention_roles TEXT, -- JSON array of mentioned role IDs
    reactions TEXT, -- JSON array of reactions (cached)
    message_type INTEGER DEFAULT 0, -- 0=default, 1=recipient_add, 2=recipient_remove, etc.
    flags INTEGER DEFAULT 0, -- Message flags
    referenced_message_id INTEGER, -- For replies
    thread_id INTEGER, -- If this message started a thread
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (referenced_message_id) REFERENCES channel_messages(id) ON DELETE SET NULL,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel_id ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_user_id ON channel_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created_at ON channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_channel_messages_thread_id ON channel_messages(thread_id);

-- ============================================
-- THREADS
-- ============================================
CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL, -- Parent channel
    parent_message_id INTEGER, -- Message that started the thread
    name TEXT NOT NULL,
    type TEXT DEFAULT 'public_thread', -- 'public_thread', 'private_thread', 'news_thread'
    archived INTEGER DEFAULT 0,
    auto_archive_duration INTEGER DEFAULT 60, -- minutes
    locked INTEGER DEFAULT 0,
    invitable INTEGER DEFAULT 1, -- For private threads
    member_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    rate_limit_per_user INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_message_id) REFERENCES channel_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_threads_channel_id ON threads(channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_parent_message_id ON threads(parent_message_id);

-- ============================================
-- THREAD MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS thread_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(thread_id, user_id),
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thread_members_thread_id ON thread_members(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_members_user_id ON thread_members(user_id);

-- ============================================
-- MESSAGE REACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    emoji_name TEXT NOT NULL,
    emoji_id TEXT, -- For custom emojis
    emoji_animated INTEGER DEFAULT 0,
    count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, emoji_name, emoji_id),
    FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);

-- ============================================
-- REACTION USERS (Who reacted)
-- ============================================
CREATE TABLE IF NOT EXISTS reaction_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reaction_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(reaction_id, user_id),
    FOREIGN KEY (reaction_id) REFERENCES message_reactions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reaction_users_reaction_id ON reaction_users(reaction_id);
CREATE INDEX IF NOT EXISTS idx_reaction_users_user_id ON reaction_users(user_id);

-- ============================================
-- CUSTOM EMOJIS
-- ============================================
CREATE TABLE IF NOT EXISTS custom_emojis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER, -- NULL for global emojis
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    animated INTEGER DEFAULT 0,
    require_colons INTEGER DEFAULT 1,
    managed INTEGER DEFAULT 0, -- Managed by integration
    available INTEGER DEFAULT 1, -- Available for use
    roles TEXT, -- JSON array of role IDs that can use this emoji
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_emojis_server_id ON custom_emojis(server_id);

-- ============================================
-- STICKERS
-- ============================================
CREATE TABLE IF NOT EXISTS stickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER, -- NULL for standard stickers
    name TEXT NOT NULL,
    description TEXT,
    tags TEXT, -- Comma-separated tags
    type INTEGER DEFAULT 1, -- 1=standard, 2=server
    format_type INTEGER DEFAULT 1, -- 1=PNG, 2=APNG, 3=Lottie
    image_url TEXT NOT NULL,
    available INTEGER DEFAULT 1,
    sort_value INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stickers_server_id ON stickers(server_id);

-- ============================================
-- GROUP DMs
-- ============================================
CREATE TABLE IF NOT EXISTS group_dms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    icon TEXT,
    owner_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_group_dms_owner_id ON group_dms(owner_id);

-- ============================================
-- GROUP DM MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS group_dm_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_dm_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_dm_id, user_id),
    FOREIGN KEY (group_dm_id) REFERENCES group_dms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_group_dm_members_group_id ON group_dm_members(group_dm_id);
CREATE INDEX IF NOT EXISTS idx_group_dm_members_user_id ON group_dm_members(user_id);

-- ============================================
-- GROUP DM MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS group_dm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_dm_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT,
    attachments TEXT, -- JSON array
    embeds TEXT, -- JSON array
    mentions TEXT, -- JSON array
    pinned INTEGER DEFAULT 0,
    edited_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_dm_id) REFERENCES group_dms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_group_dm_messages_group_id ON group_dm_messages(group_dm_id);
CREATE INDEX IF NOT EXISTS idx_group_dm_messages_user_id ON group_dm_messages(user_id);

-- ============================================
-- FRIENDS SYSTEM
-- ============================================
CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK(user_id != friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- ============================================
-- ACTIVITY STATUS
-- ============================================
CREATE TABLE IF NOT EXISTS user_activity_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    status TEXT DEFAULT 'offline', -- 'online', 'idle', 'dnd', 'offline', 'invisible'
    custom_status TEXT,
    game_name TEXT, -- Currently playing game
    game_type INTEGER, -- 0=playing, 1=streaming, 2=listening, 3=watching
    game_url TEXT, -- For streaming
    since DATETIME, -- When status started
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_status_user_id ON user_activity_status(user_id);

-- ============================================
-- VOICE STATES (Voice Channel Connections)
-- ============================================
CREATE TABLE IF NOT EXISTS voice_states (
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
    request_to_speak_timestamp DATETIME, -- For stage channels
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, session_id),
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_voice_states_server_id ON voice_states(server_id);
CREATE INDEX IF NOT EXISTS idx_voice_states_channel_id ON voice_states(channel_id);
CREATE INDEX IF NOT EXISTS idx_voice_states_user_id ON voice_states(user_id);

-- ============================================
-- STAGE INSTANCES (Stage Channels)
-- ============================================
CREATE TABLE IF NOT EXISTS stage_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    topic TEXT,
    privacy_level INTEGER DEFAULT 1, -- 1=public, 2=guild_only
    discoverable_disabled INTEGER DEFAULT 0,
    scheduled_event_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage_instances_channel_id ON stage_instances(channel_id);

-- ============================================
-- EVENTS (Scheduled Events)
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    channel_id INTEGER, -- NULL for external events
    creator_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    scheduled_start_time DATETIME NOT NULL,
    scheduled_end_time DATETIME,
    privacy_level INTEGER DEFAULT 2, -- 2=guild_only
    status INTEGER DEFAULT 1, -- 1=scheduled, 2=active, 3=completed, 4=cancelled
    entity_type INTEGER DEFAULT 1, -- 1=stage, 2=voice, 3=external
    entity_id INTEGER,
    entity_metadata TEXT, -- JSON object
    user_count INTEGER DEFAULT 0,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_events_server_id ON scheduled_events(server_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_events_channel_id ON scheduled_events(channel_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_events_status ON scheduled_events(status);

-- ============================================
-- EVENT USERS (Event Attendees)
-- ============================================
CREATE TABLE IF NOT EXISTS event_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES scheduled_events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_users_event_id ON event_users(event_id);
CREATE INDEX IF NOT EXISTS idx_event_users_user_id ON event_users(user_id);

-- ============================================
-- WEBHOOKS
-- ============================================
CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    channel_id INTEGER,
    user_id INTEGER, -- Creator
    name TEXT NOT NULL,
    avatar TEXT,
    token TEXT NOT NULL,
    type INTEGER DEFAULT 1, -- 1=incoming, 2=channel_follower, 3=application
    application_id INTEGER,
    url TEXT, -- For incoming webhooks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_server_id ON webhooks(server_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_channel_id ON webhooks(channel_id);

-- ============================================
-- INTEGRATIONS (Bots, OAuth2)
-- ============================================
CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'twitch', 'youtube', 'discord', 'guild_subscription'
    enabled INTEGER DEFAULT 1,
    syncing INTEGER DEFAULT 0,
    role_id INTEGER,
    enable_emoticons INTEGER DEFAULT 0,
    expire_behavior INTEGER DEFAULT 0,
    expire_grace_period INTEGER,
    user_id INTEGER, -- Integration user
    account TEXT, -- JSON object with account info
    synced_at DATETIME,
    subscriber_count INTEGER DEFAULT 0,
    revoked INTEGER DEFAULT 0,
    application_id INTEGER,
    scopes TEXT, -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_integrations_server_id ON integrations(server_id);

-- ============================================
-- SLASH COMMANDS
-- ============================================
CREATE TABLE IF NOT EXISTS slash_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER, -- NULL for global commands
    application_id INTEGER,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    options TEXT, -- JSON array of command options
    default_permission INTEGER DEFAULT 1,
    type INTEGER DEFAULT 1, -- 1=chat_input, 2=user, 3=message
    version TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_slash_commands_server_id ON slash_commands(server_id);

-- ============================================
-- MESSAGE PINNING
-- ============================================
CREATE TABLE IF NOT EXISTS pinned_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    pinned_by INTEGER NOT NULL,
    pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, message_id),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pinned_messages_channel_id ON pinned_messages(channel_id);

-- ============================================
-- FILE ATTACHMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS file_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER, -- NULL for standalone uploads
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER, -- bytes
    url TEXT NOT NULL,
    proxy_url TEXT,
    width INTEGER, -- For images
    height INTEGER, -- For images
    ephemeral INTEGER DEFAULT 0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_attachments_message_id ON file_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_user_id ON file_attachments(user_id);

-- ============================================
-- NITRO SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS nitro_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    tier INTEGER DEFAULT 1, -- 1=basic, 2=nitro, 3=nitro_classic
    status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'expired'
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    payment_method TEXT,
    auto_renew INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nitro_subscriptions_user_id ON nitro_subscriptions(user_id);

-- ============================================
-- SERVER BOOSTS
-- ============================================
CREATE TABLE IF NOT EXISTS server_boosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    boost_count INTEGER DEFAULT 1,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (server_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_boosts_server_id ON server_boosts(server_id);
CREATE INDEX IF NOT EXISTS idx_server_boosts_user_id ON server_boosts(user_id);

-- ============================================
-- MESSAGE SEARCH INDEX
-- ============================================
CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
    message_id,
    content,
    channel_id,
    user_id,
    created_at
);

-- ============================================
-- READ STATES (Message Read Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS read_states (
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
);

CREATE INDEX IF NOT EXISTS idx_read_states_user_id ON read_states(user_id);
CREATE INDEX IF NOT EXISTS idx_read_states_channel_id ON read_states(channel_id);
