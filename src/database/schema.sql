-- AnonBot SQLite Schema

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE NOT NULL,
    nickname TEXT UNIQUE NOT NULL,
    nickname_normalized TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    registered_at INTEGER NOT NULL,
    nickname_changed_at INTEGER,
    is_banned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guilds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT UNIQUE NOT NULL,
    guild_name TEXT,
    guild_icon TEXT,
    channel_id TEXT NOT NULL,
    webhook_id TEXT,
    webhook_token TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    configured_by TEXT NOT NULL,
    configured_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_uuid TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    discord_message_id TEXT,
    content TEXT,
    created_at INTEGER NOT NULL,
    delivery_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    discord_attachment_id TEXT,
    url TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    banned_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_nickname_norm ON users(nickname_normalized);
CREATE INDEX IF NOT EXISTS idx_guilds_guild_id ON guilds(guild_id);
CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages(message_uuid);
CREATE INDEX IF NOT EXISTS idx_messages_discord_id ON messages(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(user_id, action, timestamp);
CREATE INDEX IF NOT EXISTS idx_attachments_msg_id ON attachments(message_id);

