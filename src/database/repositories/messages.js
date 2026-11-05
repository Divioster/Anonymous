'use strict';

const { getDatabase } = require('../database');

const messageRepo = {
  createMessage({ messageUuid, userId, guildId, channelId, discordMessageId = null, content, deliveryStatus = 'PENDING' }) {
    const db = getDatabase();
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO messages (message_uuid, user_id, guild_id, channel_id, discord_message_id, content, created_at, delivery_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(messageUuid, userId, guildId, channelId, discordMessageId, content, now, deliveryStatus);
    return {
      id: Number(result.lastInsertRowid),
      message_uuid: messageUuid,
      user_id: userId,
      guild_id: guildId,
      channel_id: channelId,
      discord_message_id: discordMessageId,
      content,
      created_at: now,
      delivery_status: deliveryStatus
    };
  },

  updateDelivery(id, discordMessageId, deliveryStatus) {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE messages
      SET discord_message_id = ?, delivery_status = ?
      WHERE id = ?
    `);
    stmt.run(discordMessageId, deliveryStatus, id);
    return messageRepo.findById(id);
  },

  findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) || null;
  },

  findByUuid(messageUuid) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM messages WHERE message_uuid = ?').get(messageUuid) || null;
  },

  findByDiscordMessageId(discordMessageId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM messages WHERE discord_message_id = ?').get(discordMessageId) || null;
  },

  addAttachment({ messageId, originalFilename, mimeType, fileSize, discordAttachmentId = null, url = null }) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO attachments (message_id, original_filename, mime_type, file_size, discord_attachment_id, url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(messageId, originalFilename, mimeType, fileSize, discordAttachmentId, url);
    return {
      id: Number(result.lastInsertRowid),
      message_id: messageId,
      original_filename: originalFilename,
      mime_type: mimeType,
      file_size: fileSize,
      discord_attachment_id: discordAttachmentId,
      url
    };
  },

  getAttachmentsForMessage(messageId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId);
  },

  getMessagesByGuild(guildId, limit = 50) {
    const db = getDatabase();
    return db.prepare(`
      SELECT m.*, u.nickname, u.avatar_url
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.guild_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(guildId, limit);
  },

  getRecentMessagesByUser(userId, limit = 20) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  }
};

module.exports = messageRepo;

