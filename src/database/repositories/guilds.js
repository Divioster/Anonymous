'use strict';

const { getDatabase } = require('../database');

const guildRepo = {
  upsertGuild({ guildId, guildName = null, guildIcon = null, channelId, webhookId = null, webhookToken = null, configuredBy }) {
    const db = getDatabase();
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO guilds (guild_id, guild_name, guild_icon, channel_id, webhook_id, webhook_token, enabled, configured_by, configured_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        guild_name = excluded.guild_name,
        guild_icon = excluded.guild_icon,
        channel_id = excluded.channel_id,
        webhook_id = COALESCE(excluded.webhook_id, guilds.webhook_id),
        webhook_token = COALESCE(excluded.webhook_token, guilds.webhook_token),
        enabled = 1,
        configured_by = excluded.configured_by,
        configured_at = excluded.configured_at
    `);
    stmt.run(guildId, guildName, guildIcon, channelId, webhookId, webhookToken, configuredBy, now);
    return guildRepo.findByGuildId(guildId);
  },

  findByGuildId(guildId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId) || null;
  },

  getAllEnabledGuilds() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM guilds WHERE enabled = 1 ORDER BY id ASC').all();
  },

  getAllGuilds() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM guilds ORDER BY id ASC').all();
  },

  setEnabled(guildId, enabled) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE guilds SET enabled = ? WHERE guild_id = ?');
    stmt.run(enabled ? 1 : 0, guildId);
    return guildRepo.findByGuildId(guildId);
  },

  updateWebhook(guildId, webhookId, webhookToken) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE guilds SET webhook_id = ?, webhook_token = ? WHERE guild_id = ?');
    stmt.run(webhookId, webhookToken, guildId);
    return guildRepo.findByGuildId(guildId);
  }
};

module.exports = guildRepo;

