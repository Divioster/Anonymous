'use strict';

const path = require('path');
require('dotenv').config();

const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'GLOBAL_ADMIN_IDS'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v] || !process.env[v].trim());

if (missingVars.length > 0 && process.env.NODE_ENV !== 'test') {
  console.warn(`[Config Warning] Missing required environment variables: ${missingVars.join(', ')}`);
}

const globalAdminIds = (process.env.GLOBAL_ADMIN_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

module.exports = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  globalAdminIds,
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/bot.sqlite'),
  defaultAvatarUrl: process.env.DEFAULT_AVATAR_URL || 'https://cdn.discordapp.com/embed/avatars/0.png'
};

