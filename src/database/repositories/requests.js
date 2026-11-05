'use strict';

const { getDatabase } = require('../database');

const requestRepo = {
  createRequest({ requestUuid, discordId, type, nickname = null, nicknameNormalized = null, payload = {} }) {
    const db = getDatabase();
    const now = Date.now();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const stmt = db.prepare(`
      INSERT INTO pending_requests (
        request_uuid, discord_id, type, nickname, nickname_normalized, payload, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `);
    const result = stmt.run(
      requestUuid,
      discordId,
      type,
      nickname,
      nicknameNormalized ? nicknameNormalized.toLowerCase() : null,
      payloadStr,
      now
    );

    return requestRepo.findById(Number(result.lastInsertRowid));
  },

  findById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM pending_requests WHERE id = ?').get(id);
    if (!row) return null;
    return {
      ...row,
      payload: JSON.parse(row.payload || '{}')
    };
  },

  findByUuid(requestUuid) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM pending_requests WHERE request_uuid = ?').get(requestUuid);
    if (!row) return null;
    return {
      ...row,
      payload: JSON.parse(row.payload || '{}')
    };
  },

  findPendingByDiscordId(discordId, type = null) {
    const db = getDatabase();
    let query = "SELECT * FROM pending_requests WHERE discord_id = ? AND status = 'PENDING'";
    const params = [discordId];
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    query += ' ORDER BY created_at DESC LIMIT 1';
    const row = db.prepare(query).get(...params);
    if (!row) return null;
    return {
      ...row,
      payload: JSON.parse(row.payload || '{}')
    };
  },

  findPendingByNicknameNormalized(nicknameNormalized) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM pending_requests
      WHERE nickname_normalized = ? AND status = 'PENDING'
      LIMIT 1
    `).get(nicknameNormalized.toLowerCase());
    if (!row) return null;
    return {
      ...row,
      payload: JSON.parse(row.payload || '{}')
    };
  },

  updateStatus(id, status, reviewedBy) {
    const db = getDatabase();
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE pending_requests
      SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ?
    `);
    stmt.run(status, now, reviewedBy, id);
    return requestRepo.findById(id);
  }
};

module.exports = requestRepo;

