'use strict';

const userRepo = require('../database/repositories/users');
const messageRepo = require('../database/repositories/messages');
const moderationRepo = require('../database/repositories/moderation');
const guildRepo = require('../database/repositories/guilds');

const moderationService = {
  /**
   * Bans a user globally.
   */
  banUser({ targetIdentifier, reason = 'No reason provided', bannedBy }) {
    // targetIdentifier can be discord_id, nickname, or internal user id
    let user = null;
    if (/^\d{17,20}$/.test(targetIdentifier)) {
      user = userRepo.findByDiscordId(targetIdentifier);
    }
    if (!user) {
      user = userRepo.findByNicknameNormalized(targetIdentifier);
    }
    if (!user && !isNaN(Number(targetIdentifier))) {
      user = userRepo.findById(Number(targetIdentifier));
    }

    if (!user) {
      return { success: false, error: `User "${targetIdentifier}" not found.` };
    }

    moderationRepo.recordBan({
      userId: user.id,
      reason,
      bannedBy
    });

    moderationRepo.logAudit({
      actorId: bannedBy,
      action: 'USER_BANNED',
      targetId: String(user.id),
      metadata: { discordId: user.discord_id, nickname: user.nickname, reason }
    });

    return { success: true, user, reason };
  },

  /**
   * Unbans a user globally.
   */
  unbanUser({ targetIdentifier, unbannedBy }) {
    let user = null;
    if (/^\d{17,20}$/.test(targetIdentifier)) {
      user = userRepo.findByDiscordId(targetIdentifier);
    }
    if (!user) {
      user = userRepo.findByNicknameNormalized(targetIdentifier);
    }
    if (!user && !isNaN(Number(targetIdentifier))) {
      user = userRepo.findById(Number(targetIdentifier));
    }

    if (!user) {
      return { success: false, error: `User "${targetIdentifier}" not found.` };
    }

    moderationRepo.removeBan(user.id);

    moderationRepo.logAudit({
      actorId: unbannedBy,
      action: 'USER_UNBANNED',
      targetId: String(user.id),
      metadata: { discordId: user.discord_id, nickname: user.nickname }
    });

    return { success: true, user };
  },

  /**
   * Retrieves user info.
   */
  getUserInfo(targetIdentifier) {
    let user = null;
    if (/^\d{17,20}$/.test(targetIdentifier)) {
      user = userRepo.findByDiscordId(targetIdentifier);
    }
    if (!user) {
      user = userRepo.findByNicknameNormalized(targetIdentifier);
    }
    if (!user && !isNaN(Number(targetIdentifier))) {
      user = userRepo.findById(Number(targetIdentifier));
    }

    if (!user) {
      return { success: false, error: `User "${targetIdentifier}" not found.` };
    }

    const activeBan = moderationRepo.findActiveBan(user.id);
    const recentMessages = messageRepo.getRecentMessagesByUser(user.id, 5);

    return {
      success: true,
      user,
      ban: activeBan,
      recentMessages
    };
  },

  /**
   * Looks up a message and its sender.
   */
  lookupMessage(messageIdentifier) {
    let msg = messageRepo.findByUuid(messageIdentifier);
    if (!msg) {
      msg = messageRepo.findByDiscordMessageId(messageIdentifier);
    }

    if (!msg) {
      return { success: false, error: `Message "${messageIdentifier}" not found in database.` };
    }

    const sender = userRepo.findById(msg.user_id);
    const attachments = messageRepo.getAttachmentsForMessage(msg.id);
    const guildConfig = guildRepo.findByGuildId(msg.guild_id);

    return {
      success: true,
      message: msg,
      sender,
      attachments,
      guild: guildConfig
    };
  },

  /**
   * Deletes a published message from Discord and logs action.
   */
  async deleteMessage({ client, messageIdentifier, deletedBy }) {
    const lookup = this.lookupMessage(messageIdentifier);
    if (!lookup.success) {
      return lookup;
    }

    const msg = lookup.message;
    const guild = client.guilds.cache.get(msg.guild_id);
    if (!guild) {
      return { success: false, error: 'Destination guild is not currently accessible to the bot.' };
    }

    const channel = guild.channels.cache.get(msg.channel_id);
    if (!channel) {
      return { success: false, error: 'Destination channel not found.' };
    }

    try {
      if (msg.discord_message_id) {
        const discordMsg = await channel.messages.fetch(msg.discord_message_id).catch(() => null);
        if (discordMsg) {
          await discordMsg.delete();
        }
      }
    } catch (err) {
      return { success: false, error: `Could not delete Discord message: ${err.message}` };
    }

    messageRepo.updateDelivery(msg.id, msg.discord_message_id, 'DELETED');

    moderationRepo.logAudit({
      actorId: deletedBy,
      action: 'MESSAGE_DELETED',
      targetId: msg.message_uuid,
      metadata: { originalSender: lookup.sender ? lookup.sender.nickname : 'Unknown' }
    });

    return { success: true, messageUuid: msg.message_uuid };
  },

  /**
   * Retrieves overall bot statistics.
   */
  getStats() {
    return moderationRepo.getStats();
  },

  /**
   * Lists registered users who sent messages in a specific guild/channel, or all users.
   */
  getChannelUsers(guildId) {
    const messages = messageRepo.getMessagesByGuild(guildId, 100);
    const userMap = new Map();

    for (const msg of messages) {
      if (!userMap.has(msg.user_id)) {
        userMap.set(msg.user_id, {
          userId: msg.user_id,
          nickname: msg.nickname,
          avatarUrl: msg.avatar_url,
          lastActive: msg.created_at,
          messageCount: 1
        });
      } else {
        const existing = userMap.get(msg.user_id);
        existing.messageCount += 1;
      }
    }

    return Array.from(userMap.values());
  }
};

module.exports = moderationService;

