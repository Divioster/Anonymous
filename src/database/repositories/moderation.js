'use strict';

const { getDatabase } = require('../database');
const constants = require('../../config/constants');

const moderationRepo = {
  recordBan({ userId, reason, bannedBy, expiresAt = null }) {
    const db = getDatabase();
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO bans (user_id, reason, banned_by, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId, reason, bannedBy, now, expiresAt);

    // Update is_banned in users table
    db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(userId);
  },

  removeBan(userId) {
    const db = getDatabase();
    db.prepare('DELETE FROM bans WHERE user_id = ?').run(userId);
    db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(userId);
  },

  findActiveBan(userId) {
    const db = getDatabase();
    const now = Date.now();
    const ban = db.prepare(`
      SELECT * FROM bans
      WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId, now);

    return ban || null;
  },

  logAudit({ actorId, action, targetId = null, metadata = null }) {
    const db = getDatabase();
    const now = Date.now();
    const metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;
    const stmt = db.prepare(`
      INSERT INTO audit_logs (actor_id, action, target_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(actorId, action, targetId ? String(targetId) : null, metaStr, now);
  },

  recordRateLimitAction(userId, action) {
    const db = getDatabase();
    const now = Date.now();
    db.prepare('INSERT INTO rate_limits (user_id, action, timestamp) VALUES (?, ?, ?)').run(userId, action, now);
  },

  checkRateLimits(userId, action = 'send_message') {
    const db = getDatabase();
    const now = Date.now();
    const limits = constants.RATE_LIMITS;

    // 1. Min interval check (e.g. 5 seconds)
    const recentOne = db.prepare(`
      SELECT timestamp FROM rate_limits
      WHERE user_id = ? AND action = ? AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(userId, action, now - limits.MIN_INTERVAL_MS);

    if (recentOne) {
      const waitSeconds = Math.ceil((limits.MIN_INTERVAL_MS - (now - recentOne.timestamp)) / 1000);
      return {
        limited: true,
        reason: `Please wait ${waitSeconds}s before sending another message.`
      };
    }

    // 2. Max per minute check
    const countMinute = db.prepare(`
      SELECT COUNT(*) as count FROM rate_limits
      WHERE user_id = ? AND action = ? AND timestamp > ?
    `).get(userId, action, now - limits.WINDOW_MINUTE_MS).count;

    if (countMinute >= limits.MAX_PER_MINUTE) {
      return {
        limited: true,
        reason: `Rate limit reached: Maximum ${limits.MAX_PER_MINUTE} messages per minute.`
      };
    }

    // 3. Max per day check
    const countDay = db.prepare(`
      SELECT COUNT(*) as count FROM rate_limits
      WHERE user_id = ? AND action = ? AND timestamp > ?
    `).get(userId, action, now - limits.WINDOW_DAY_MS).count;

    if (countDay >= limits.MAX_PER_DAY) {
      return {
        limited: true,
        reason: `Daily limit reached: Maximum ${limits.MAX_PER_DAY} messages per day.`
      };
    }

    return { limited: false };
  },

  cleanupOldRateLimits() {
    const db = getDatabase();
    const cutoff = Date.now() - constants.RATE_LIMITS.WINDOW_DAY_MS;
    db.prepare('DELETE FROM rate_limits WHERE timestamp < ?').run(cutoff);
  },

  getStats() {
    const db = getDatabase();
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const bannedUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_banned = 1').get().count;
    const totalGuilds = db.prepare('SELECT COUNT(*) as count FROM guilds').get().count;
    const activeGuilds = db.prepare('SELECT COUNT(*) as count FROM guilds WHERE enabled = 1').get().count;
    const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
    const deliveredMessages = db.prepare("SELECT COUNT(*) as count FROM messages WHERE delivery_status = 'DELIVERED'").get().count;

    return {
      totalUsers,
      bannedUsers,
      totalGuilds,
      activeGuilds,
      totalMessages,
      deliveredMessages
    };
  }
};

module.exports = moderationRepo;

