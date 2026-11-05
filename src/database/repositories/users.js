'use strict';

const { getDatabase } = require('../database');

const userRepo = {
  createUser({ discordId, nickname, avatarUrl = null }) {
    const db = getDatabase();
    const now = Date.now();
    const nicknameNormalized = nickname.trim().toLowerCase();
    const stmt = db.prepare(`
      INSERT INTO users (discord_id, nickname, nickname_normalized, avatar_url, registered_at, is_banned)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(discordId, nickname.trim(), nicknameNormalized, avatarUrl, now);
    return {
      id: Number(result.lastInsertRowid),
      discord_id: discordId,
      nickname: nickname.trim(),
      nickname_normalized: nicknameNormalized,
      avatar_url: avatarUrl,
      registered_at: now,
      nickname_changed_at: null,
      is_banned: 0
    };
  },

  findByDiscordId(discordId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) || null;
  },

  findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  },

  findByNicknameNormalized(nicknameNormalized) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE nickname_normalized = ?').get(nicknameNormalized.toLowerCase()) || null;
  },

  updateNickname(id, nickname) {
    const db = getDatabase();
    const now = Date.now();
    const nicknameNormalized = nickname.trim().toLowerCase();
    const stmt = db.prepare(`
      UPDATE users
      SET nickname = ?, nickname_normalized = ?, nickname_changed_at = ?
      WHERE id = ?
    `);
    stmt.run(nickname.trim(), nicknameNormalized, now, id);
    return userRepo.findById(id);
  },

  updateAvatar(id, avatarUrl) {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE users
      SET avatar_url = ?
      WHERE id = ?
    `);
    stmt.run(avatarUrl, id);
    return userRepo.findById(id);
  },

  deleteUser(id) {
    const db = getDatabase();
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  setBanStatus(id, isBanned) {
    const db = getDatabase();
    return db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(isBanned ? 1 : 0, id);
  },

  getAllUsers() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users ORDER BY registered_at DESC').all();
  }
};

module.exports = userRepo;

