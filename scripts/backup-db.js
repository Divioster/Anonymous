'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../src/config/config');
const { getDatabase } = require('../src/database/database');

const backupDir = path.resolve(__dirname, '../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `anonbot-backup-${timestamp}.sqlite`);

console.log(`[Backup] Starting online SQLite backup to ${backupFile}...`);

const db = getDatabase();

db.backup(backupFile)
  .then(() => {
    console.log(`[Backup] Backup completed successfully: ${backupFile}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Backup Error] Failed to create database backup:', err);
    process.exit(1);
  });

