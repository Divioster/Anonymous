'use strict';

const moderationRepo = require('../database/repositories/moderation');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`[AnonBot] Ready! Logged in as ${client.user.tag} (ID: ${client.user.id})`);
    console.log(`[AnonBot] Connected to ${client.guilds.cache.size} guilds.`);

    // Set initial presence
    client.user.setActivity('DM me /send to chat anonymously', { type: 3 }); // Watching

    // Periodic cleanup of expired rate limit entries (every 60 minutes)
    setInterval(() => {
      try {
        moderationRepo.cleanupOldRateLimits();
      } catch (err) {
        console.error('[Rate Limit Cleanup Error]', err.message);
      }
    }, 60 * 60 * 1000);
  }
};

