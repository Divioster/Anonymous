'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const userRepo = require('../database/repositories/users');
const requestRepo = require('../database/repositories/requests');
const moderationRepo = require('../database/repositories/moderation');
const constants = require('../config/constants');
const config = require('../config/config');
const { validateNickname, validateAvatarUrl } = require('../utils/validation');
const { generateUuid, createInfoEmbed, formatDate } = require('../utils/helpers');

const registrationService = {
  /**
   * Helper to send DM notification to all configured bot owners.
   */
  async notifyOwners(client, { embed, actionRow }) {
    for (const adminId of config.globalAdminIds) {
      try {
        const ownerUser = await client.users.fetch(adminId).catch(() => null);
        if (ownerUser) {
          await ownerUser.send({
            embeds: [embed],
            components: actionRow ? [actionRow] : []
          });
        }
      } catch (err) {
        console.warn(`[Owner Notification] Could not send DM to owner ${adminId}: ${err.message}`);
      }
    }
  },

  /**
   * Helper to notify requesting user via DM.
   */
  async notifyUser(client, discordId, embed) {
    try {
      const user = await client.users.fetch(discordId).catch(() => null);
      if (user) {
        await user.send({ embeds: [embed] }).catch(() => null);
      }
    } catch (err) {
      console.warn(`[User Notification] Could not send DM to user ${discordId}: ${err.message}`);
    }
  },

  /**
   * Submits a registration request for bot owner review.
   */
  async requestRegistration({ client, discordId, nickname, avatarUrl = null }) {
    // 1. Check if already registered
    const existingUser = userRepo.findByDiscordId(discordId);
    if (existingUser) {
      return {
        success: false,
        error: `You are already registered with the nickname: **${existingUser.nickname}**.`
      };
    }

    // 2. Check if a pending registration request already exists for this user
    const pendingUserReq = requestRepo.findPendingByDiscordId(discordId, 'REGISTRATION');
    if (pendingUserReq) {
      return {
        success: false,
        error: `You already have a pending registration request for **${pendingUserReq.nickname}** awaiting bot owner approval.`
      };
    }

    // 3. Validate nickname
    const nickValidation = validateNickname(nickname);
    if (!nickValidation.valid) {
      return { success: false, error: nickValidation.error };
    }

    // 4. Check uniqueness across existing registered users
    const existingNick = userRepo.findByNicknameNormalized(nickValidation.normalized);
    if (existingNick) {
      return {
        success: false,
        error: `The nickname "${nickValidation.nickname}" is already registered. Please choose another.`
      };
    }

    // 5. Check uniqueness across pending requests
    const pendingNick = requestRepo.findPendingByNicknameNormalized(nickValidation.normalized);
    if (pendingNick) {
      return {
        success: false,
        error: `The nickname "${nickValidation.nickname}" is currently pending review for another user. Please choose another.`
      };
    }

    // 6. Validate avatar URL if provided
    let cleanAvatar = null;
    if (avatarUrl) {
      const avatarValidation = validateAvatarUrl(avatarUrl);
      if (!avatarValidation.valid) {
        return { success: false, error: avatarValidation.error };
      }
      cleanAvatar = avatarValidation.url;
    }

    // 7. Create pending request
    const requestUuid = generateUuid();
    const createdReq = requestRepo.createRequest({
      requestUuid,
      discordId,
      type: 'REGISTRATION',
      nickname: nickValidation.nickname,
      nicknameNormalized: nickValidation.normalized,
      payload: {
        nickname: nickValidation.nickname,
        avatarUrl: cleanAvatar
      }
    });

    // 8. Build buttons and notification embed for bot owner
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C) // Yellow
      .setTitle('📝 New Registration Request')
      .setDescription(
        `A user has requested to register a new anonymous identity.\n\n` +
        `• **User:** <@${discordId}> (\`${discordId}\`)\n` +
        `• **Requested Nickname:** **${nickValidation.nickname}**\n` +
        `• **Profile Picture:** ${cleanAvatar ? `[Custom Avatar](${cleanAvatar})` : 'Default'}\n` +
        `• **Submitted At:** ${formatDate(createdReq.created_at)}`
      )
      .setFooter({ text: `Request ID: ${createdReq.id} • UUID: ${requestUuid}` })
      .setTimestamp();

    if (cleanAvatar) {
      embed.setThumbnail(cleanAvatar);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_req_${createdReq.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`decline_req_${createdReq.id}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    await this.notifyOwners(client, { embed, actionRow: row });

    moderationRepo.logAudit({
      actorId: discordId,
      action: 'REGISTRATION_REQUESTED',
      targetId: String(createdReq.id),
      metadata: { nickname: nickValidation.nickname }
    });

    return {
      success: true,
      pending: true,
      nickname: nickValidation.nickname,
      avatarUrl: cleanAvatar
    };
  },

  /**
   * Submits a nickname change request for bot owner review.
   */
  async requestNicknameChange({ client, discordId, newNickname }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'You are not registered yet. Use `/register` first.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been suspended from using AnonBot.' };
    }

    // Check if user already has a pending request
    const pendingReq = requestRepo.findPendingByDiscordId(discordId, 'NICKNAME_CHANGE');
    if (pendingReq) {
      return {
        success: false,
        error: `You already have a pending nickname change request to **${pendingReq.nickname}** awaiting review.`
      };
    }

    // Check cooldown
    if (user.nickname_changed_at) {
      const elapsed = Date.now() - user.nickname_changed_at;
      if (elapsed < constants.NICKNAME.COOLDOWN_MS) {
        const remainingDays = Math.ceil((constants.NICKNAME.COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
        return {
          success: false,
          error: `Nickname cooldown active. You can request another change in ${remainingDays} day(s).`
        };
      }
    }

    // Validate nickname
    const validation = validateNickname(newNickname);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    if (validation.normalized === user.nickname_normalized) {
      return { success: false, error: 'Your new nickname cannot be the same as your current nickname.' };
    }

    // Check uniqueness across users
    const taken = userRepo.findByNicknameNormalized(validation.normalized);
    if (taken && taken.id !== user.id) {
      return { success: false, error: `The nickname "${validation.nickname}" is already registered.` };
    }

    // Check uniqueness across pending requests
    const pendingNick = requestRepo.findPendingByNicknameNormalized(validation.normalized);
    if (pendingNick) {
      return {
        success: false,
        error: `The nickname "${validation.nickname}" is currently pending review for another user.`
      };
    }

    const requestUuid = generateUuid();
    const createdReq = requestRepo.createRequest({
      requestUuid,
      discordId,
      type: 'NICKNAME_CHANGE',
      nickname: validation.nickname,
      nicknameNormalized: validation.normalized,
      payload: {
        userId: user.id,
        oldNickname: user.nickname,
        newNickname: validation.nickname
      }
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2) // Blurple
      .setTitle('🔄 Nickname Change Request')
      .setDescription(
        `A user has requested to change their anonymous nickname.\n\n` +
        `• **User:** <@${discordId}> (\`${discordId}\`)\n` +
        `• **Current Nickname:** **${user.nickname}**\n` +
        `• **Requested New Nickname:** **${validation.nickname}**\n` +
        `• **Submitted At:** ${formatDate(createdReq.created_at)}`
      )
      .setFooter({ text: `Request ID: ${createdReq.id} • UUID: ${requestUuid}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_req_${createdReq.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`decline_req_${createdReq.id}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    await this.notifyOwners(client, { embed, actionRow: row });

    moderationRepo.logAudit({
      actorId: discordId,
      action: 'NICKNAME_CHANGE_REQUESTED',
      targetId: String(createdReq.id),
      metadata: { oldNickname: user.nickname, newNickname: validation.nickname }
    });

    return {
      success: true,
      pending: true,
      oldNickname: user.nickname,
      newNickname: validation.nickname
    };
  },

  /**
   * Submits an account deletion request for bot owner review.
   */
  async requestAccountDeletion({ client, discordId }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'No registered account found for your Discord user.' };
    }

    const pendingReq = requestRepo.findPendingByDiscordId(discordId, 'ACCOUNT_DELETION');
    if (pendingReq) {
      return {
        success: false,
        error: 'You already have an account deletion request pending review.'
      };
    }

    const requestUuid = generateUuid();
    const createdReq = requestRepo.createRequest({
      requestUuid,
      discordId,
      type: 'ACCOUNT_DELETION',
      nickname: user.nickname,
      nicknameNormalized: user.nickname_normalized,
      payload: {
        userId: user.id,
        nickname: user.nickname
      }
    });

    const embed = new EmbedBuilder()
      .setColor(0xED4245) // Red
      .setTitle('🗑️ Account Deletion Request')
      .setDescription(
        `A user has requested to delete their AnonBot account.\n\n` +
        `• **User:** <@${discordId}> (\`${discordId}\`)\n` +
        `• **Registered Nickname:** **${user.nickname}**\n` +
        `• **Submitted At:** ${formatDate(createdReq.created_at)}`
      )
      .setFooter({ text: `Request ID: ${createdReq.id} • UUID: ${requestUuid}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_req_${createdReq.id}`)
        .setLabel('Accept Deletion')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚠️'),
      new ButtonBuilder()
        .setCustomId(`decline_req_${createdReq.id}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

    await this.notifyOwners(client, { embed, actionRow: row });

    moderationRepo.logAudit({
      actorId: discordId,
      action: 'ACCOUNT_DELETION_REQUESTED',
      targetId: String(createdReq.id),
      metadata: { nickname: user.nickname }
    });

    return { success: true, pending: true, nickname: user.nickname };
  },

  /**
   * Handles Bot Owner clicking Accept or Decline on a request.
   */
  async handleRequestDecision({ client, requestId, decision, reviewerId }) {
    const request = requestRepo.findById(requestId);
    if (!request) {
      return { success: false, error: 'Request not found in database.' };
    }

    if (request.status !== 'PENDING') {
      return {
        success: false,
        error: `This request has already been ${request.status.toLowerCase()} by <@${request.reviewed_by}>.`
      };
    }

    const isApproval = decision === 'APPROVED';

    // 1. Process Approval
    if (isApproval) {
      if (request.type === 'REGISTRATION') {
        // Enforce uniqueness one more time right at time of acceptance
        const taken = userRepo.findByNicknameNormalized(request.nickname_normalized);
        if (taken) {
          return {
            success: false,
            error: `Cannot approve: The nickname "${request.nickname}" is already registered to user <@${taken.discord_id}>.`
          };
        }

        const newUser = userRepo.createUser({
          discordId: request.discord_id,
          nickname: request.nickname,
          avatarUrl: request.payload.avatarUrl || null
        });

        requestRepo.updateStatus(request.id, 'APPROVED', reviewerId);

        moderationRepo.logAudit({
          actorId: reviewerId,
          action: 'REGISTRATION_APPROVED',
          targetId: String(newUser.id),
          metadata: { nickname: newUser.nickname, discordId: request.discord_id }
        });

        // Notify user in DM
        const userNotice = new EmbedBuilder()
          .setColor(0x57F287) // Green
          .setTitle('🎉 Registration Approved!')
          .setDescription(
            `Your registration request has been accepted by the bot owner.\n\n` +
            `• **Your Nickname:** **${newUser.nickname}**\n` +
            `• You can now send anonymous messages using \`/send\`!\n` +
            `• Use \`/servers\` to view available participating servers.`
          )
          .setTimestamp();

        if (newUser.avatar_url) {
          userNotice.setThumbnail(newUser.avatar_url);
        }

        await this.notifyUser(client, request.discord_id, userNotice);

        return {
          success: true,
          status: 'APPROVED',
          type: request.type,
          nickname: newUser.nickname,
          discordId: request.discord_id
        };
      }

      if (request.type === 'NICKNAME_CHANGE') {
        const user = userRepo.findByDiscordId(request.discord_id);
        if (!user) {
          return { success: false, error: 'User account no longer exists.' };
        }

        const taken = userRepo.findByNicknameNormalized(request.nickname_normalized);
        if (taken && taken.id !== user.id) {
          return {
            success: false,
            error: `Cannot approve: The nickname "${request.nickname}" was taken by another user.`
          };
        }

        const updatedUser = userRepo.updateNickname(user.id, request.nickname);
        requestRepo.updateStatus(request.id, 'APPROVED', reviewerId);

        moderationRepo.logAudit({
          actorId: reviewerId,
          action: 'NICKNAME_CHANGE_APPROVED',
          targetId: String(user.id),
          metadata: { oldNickname: user.nickname, newNickname: updatedUser.nickname }
        });

        const userNotice = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🎉 Nickname Change Approved!')
          .setDescription(`Your anonymous nickname has been changed to **${updatedUser.nickname}**!`)
          .setTimestamp();

        await this.notifyUser(client, request.discord_id, userNotice);

        return {
          success: true,
          status: 'APPROVED',
          type: request.type,
          nickname: updatedUser.nickname,
          discordId: request.discord_id
        };
      }

      if (request.type === 'ACCOUNT_DELETION') {
        const user = userRepo.findByDiscordId(request.discord_id);
        if (user) {
          userRepo.deleteUser(user.id);
        }

        requestRepo.updateStatus(request.id, 'APPROVED', reviewerId);

        moderationRepo.logAudit({
          actorId: reviewerId,
          action: 'ACCOUNT_DELETION_APPROVED',
          targetId: request.discord_id,
          metadata: { nickname: request.nickname }
        });

        const userNotice = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('Account Deleted')
          .setDescription(
            `Your AnonBot account and nickname (**${request.nickname}**) have been deleted by the bot owner.\n` +
            `You can register again at any time using \`/register\`.`
          )
          .setTimestamp();

        await this.notifyUser(client, request.discord_id, userNotice);

        return {
          success: true,
          status: 'APPROVED',
          type: request.type,
          nickname: request.nickname,
          discordId: request.discord_id
        };
      }
    }

    // 2. Process Decline
    requestRepo.updateStatus(request.id, 'DECLINED', reviewerId);

    moderationRepo.logAudit({
      actorId: reviewerId,
      action: `${request.type}_DECLINED`,
      targetId: request.discord_id,
      metadata: { nickname: request.nickname }
    });

    const userNotice = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('Request Declined')
      .setDescription(
        `Your **${request.type.toLowerCase().replace('_', ' ')}** request for **${request.nickname}** was declined by the bot owner.`
      )
      .setTimestamp();

    await this.notifyUser(client, request.discord_id, userNotice);

    return {
      success: true,
      status: 'DECLINED',
      type: request.type,
      nickname: request.nickname,
      discordId: request.discord_id
    };
  },

  /**
   * Retrieves user profile by Discord ID.
   */
  getUser(discordId) {
    return userRepo.findByDiscordId(discordId);
  },

  /**
   * Direct avatar update (immediate, does not change identity).
   */
  updateAvatar({ discordId, avatarUrl }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'You are not registered yet. Use `/register` first.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been suspended from using AnonBot.' };
    }

    let cleanUrl = null;
    if (avatarUrl) {
      const validation = validateAvatarUrl(avatarUrl);
      if (!avatarValidation.valid) {
        return { success: false, error: avatarValidation.error };
      }
      cleanUrl = validation.url;
    }

    const updated = userRepo.updateAvatar(user.id, cleanUrl);

    moderationRepo.logAudit({
      actorId: discordId,
      action: cleanUrl ? 'AVATAR_UPDATED' : 'AVATAR_REMOVED',
      targetId: String(user.id),
      metadata: { avatarUrl: cleanUrl }
    });

    return { success: true, user: updated };
  }
};

module.exports = registrationService;
