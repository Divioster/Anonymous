'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
const userRepo = require('../database/repositories/users');
const requestRepo = require('../database/repositories/requests');
const moderationRepo = require('../database/repositories/moderation');
const constants = require('../config/constants');
const config = require('../config/config');
const { validateNickname, validateAvatarUrl } = require('../utils/validation');
const { generateUuid, formatDate } = require('../utils/helpers');

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
   * Resolves a permanent, non-ephemeral Discord CDN URL for avatar files.
   * If an attachment is provided from an interaction, re-upload it via DM so Discord assigns
   * a permanent public URL that Webhook workers can fetch without 403 Forbidden.
   */
  async resolvePermanentAvatarUrl(client, discordId, urlOption, fileOption) {
    if (fileOption) {
      try {
        let storageMsg = null;
        try {
          const user = await client.users.fetch(discordId).catch(() => null);
          if (user) {
            storageMsg = await user.send({
              content: '🎨 Anonymous avatar stored for your profile:',
              files: [fileOption.url]
            }).catch(() => null);
          }
        } catch {}

        if (!storageMsg && config.globalAdminIds.length > 0) {
          const adminUser = await client.users.fetch(config.globalAdminIds[0]).catch(() => null);
          if (adminUser) {
            storageMsg = await adminUser.send({
              content: `🎨 Anonymous avatar storage for <@${discordId}>:`,
              files: [fileOption.url]
            }).catch(() => null);
          }
        }

        if (storageMsg && storageMsg.attachments.size > 0) {
          return storageMsg.attachments.first().url;
        }
        return fileOption.url;
      } catch (err) {
        console.warn('[Avatar Upload Resolve Error]', err.message);
        return fileOption.url;
      }
    }

    if (urlOption && typeof urlOption === 'string') {
      return urlOption.trim();
    }

    return null;
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
   * Submits a nickname and/or avatar change request for bot owner review.
   */
  async requestNicknameChange({ client, discordId, newNickname = null, avatarUrl = null }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'You are not registered yet. Use `/register` first.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been suspended from using AnonBot.' };
    }

    if (!newNickname && !avatarUrl) {
      return {
        success: false,
        error: 'Please provide either a new nickname, an avatar URL, or upload an image file.'
      };
    }

    // Check if user already has a pending request
    const pendingReq = requestRepo.findPendingByDiscordId(discordId, 'NICKNAME_CHANGE');
    if (pendingReq) {
      return {
        success: false,
        error: `You already have a pending profile change request awaiting bot owner review.`
      };
    }

    let targetNickname = user.nickname;
    let targetNicknameNormalized = user.nickname_normalized;
    let nicknameChanged = false;

    if (newNickname && newNickname.trim()) {
      // Check cooldown
      if (user.nickname_changed_at) {
        const elapsed = Date.now() - user.nickname_changed_at;
        if (elapsed < constants.NICKNAME.COOLDOWN_MS) {
          const remainingDays = Math.ceil((constants.NICKNAME.COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
          return {
            success: false,
            error: `Nickname cooldown active. You can request another nickname change in ${remainingDays} day(s).`
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

      targetNickname = validation.nickname;
      targetNicknameNormalized = validation.normalized;
      nicknameChanged = true;
    }

    // Validate avatar if provided
    let cleanAvatar = user.avatar_url;
    let avatarChanged = false;
    if (avatarUrl) {
      const avatarValidation = validateAvatarUrl(avatarUrl);
      if (!avatarValidation.valid) {
        return { success: false, error: avatarValidation.error };
      }
      cleanAvatar = avatarValidation.url;
      avatarChanged = true;
    }

    const requestUuid = generateUuid();
    const createdReq = requestRepo.createRequest({
      requestUuid,
      discordId,
      type: 'NICKNAME_CHANGE',
      nickname: targetNickname,
      nicknameNormalized: targetNicknameNormalized,
      payload: {
        userId: user.id,
        oldNickname: user.nickname,
        newNickname: targetNickname,
        nicknameChanged,
        oldAvatar: user.avatar_url,
        newAvatar: cleanAvatar,
        avatarChanged
      }
    });

    const changeDescription = [
      `• **User:** <@${discordId}> (\`${discordId}\`)`,
      nicknameChanged
        ? `• **Nickname Change:** **${user.nickname}** ➔ **${targetNickname}**`
        : `• **Nickname:** **${user.nickname}** (Unchanged)`,
      avatarChanged
        ? `• **Avatar Update:** [New Avatar Preview](${cleanAvatar})`
        : `• **Avatar:** ${user.avatar_url ? `[Current Avatar](${user.avatar_url})` : 'Default'} (Unchanged)`,
      `• **Submitted At:** ${formatDate(createdReq.created_at)}`
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865F2) // Blurple
      .setTitle('🔄 Profile / Nickname Change Request')
      .setDescription(`A user has submitted a profile update request for approval.\n\n${changeDescription}`)
      .setFooter({ text: `Request ID: ${createdReq.id} • UUID: ${requestUuid}` })
      .setTimestamp();

    if (avatarChanged && cleanAvatar) {
      embed.setThumbnail(cleanAvatar);
    } else if (user.avatar_url) {
      embed.setThumbnail(user.avatar_url);
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
      action: 'NICKNAME_CHANGE_REQUESTED',
      targetId: String(createdReq.id),
      metadata: {
        oldNickname: user.nickname,
        newNickname: targetNickname,
        nicknameChanged,
        avatarChanged
      }
    });

    return {
      success: true,
      pending: true,
      oldNickname: user.nickname,
      newNickname: targetNickname,
      nicknameChanged,
      avatarChanged,
      newAvatar: cleanAvatar
    };
  },

  /**
   * Submits an avatar change or removal request for bot owner review.
   */
  async requestAvatarChange({ client, discordId, avatarUrl = null, attachmentFile = null, isRemove = false }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'You are not registered yet. Use `/register` first.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been suspended from using AnonBot.' };
    }

    const pendingReq = requestRepo.findPendingByDiscordId(discordId, 'AVATAR_CHANGE');
    if (pendingReq) {
      return {
        success: false,
        error: 'You already have an avatar update request awaiting bot owner review.'
      };
    }

    let cleanAvatar = null;
    if (!isRemove) {
      const resolved = await this.resolvePermanentAvatarUrl(client, discordId, avatarUrl, attachmentFile);
      if (!resolved) {
        return { success: false, error: 'Could not resolve avatar image.' };
      }
      const validation = validateAvatarUrl(resolved);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      cleanAvatar = validation.url;
    }

    const requestUuid = generateUuid();
    const createdReq = requestRepo.createRequest({
      requestUuid,
      discordId,
      type: 'AVATAR_CHANGE',
      nickname: user.nickname,
      nicknameNormalized: user.nickname_normalized,
      payload: {
        userId: user.id,
        oldAvatar: user.avatar_url,
        newAvatar: cleanAvatar,
        isRemove
      }
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🖼️ Avatar Update Request')
      .setDescription(
        `A user has requested to update their anonymous avatar.\n\n` +
        `• **User:** <@${discordId}> (\`${discordId}\`)\n` +
        `• **Nickname:** **${user.nickname}**\n` +
        `• **Requested Change:** ${isRemove ? 'Reset to Default Avatar' : `[New Avatar Preview](${cleanAvatar})`}\n` +
        `• **Submitted At:** ${formatDate(createdReq.created_at)}`
      )
      .setFooter({ text: `Request ID: ${createdReq.id} • UUID: ${requestUuid}` })
      .setTimestamp();

    if (!isRemove && cleanAvatar) {
      embed.setThumbnail(cleanAvatar);
    } else if (user.avatar_url) {
      embed.setThumbnail(user.avatar_url);
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
      action: isRemove ? 'AVATAR_REMOVAL_REQUESTED' : 'AVATAR_CHANGE_REQUESTED',
      targetId: String(createdReq.id),
      metadata: { newAvatar: cleanAvatar }
    });

    return {
      success: true,
      pending: true,
      newAvatar: cleanAvatar,
      isRemove,
      nickname: user.nickname
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

        const payload = request.payload;
        let updatedUser = user;

        if (payload.nicknameChanged) {
          const taken = userRepo.findByNicknameNormalized(request.nickname_normalized);
          if (taken && taken.id !== user.id) {
            return {
              success: false,
              error: `Cannot approve: The nickname "${request.nickname}" was taken by another user.`
            };
          }
          updatedUser = userRepo.updateNickname(user.id, request.nickname);
        }

        if (payload.avatarChanged) {
          updatedUser = userRepo.updateAvatar(user.id, payload.newAvatar);
        }

        requestRepo.updateStatus(request.id, 'APPROVED', reviewerId);

        moderationRepo.logAudit({
          actorId: reviewerId,
          action: 'NICKNAME_CHANGE_APPROVED',
          targetId: String(user.id),
          metadata: {
            nickname: updatedUser.nickname,
            avatarUrl: updatedUser.avatar_url
          }
        });

        const userNotice = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🎉 Profile Update Approved!')
          .setDescription(
            `Your profile update request has been approved by the bot owner!\n\n` +
            `• **Nickname:** **${updatedUser.nickname}**\n` +
            `• **Profile Picture:** ${updatedUser.avatar_url ? `[Custom Avatar](${updatedUser.avatar_url})` : 'Default'}`
          )
          .setTimestamp();

        if (updatedUser.avatar_url) {
          userNotice.setThumbnail(updatedUser.avatar_url);
        }

        await this.notifyUser(client, request.discord_id, userNotice);

        return {
          success: true,
          status: 'APPROVED',
          type: request.type,
          nickname: updatedUser.nickname,
          discordId: request.discord_id
        };
      }

      if (request.type === 'AVATAR_CHANGE') {
        const user = userRepo.findByDiscordId(request.discord_id);
        if (!user) {
          return { success: false, error: 'User account no longer exists.' };
        }

        const updatedUser = userRepo.updateAvatar(user.id, request.payload.newAvatar);
        requestRepo.updateStatus(request.id, 'APPROVED', reviewerId);

        moderationRepo.logAudit({
          actorId: reviewerId,
          action: request.payload.isRemove ? 'AVATAR_REMOVED_APPROVED' : 'AVATAR_CHANGE_APPROVED',
          targetId: String(user.id),
          metadata: { avatarUrl: updatedUser.avatar_url }
        });

        const userNotice = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🎉 Avatar Update Approved!')
          .setDescription(
            request.payload.isRemove
              ? 'Your anonymous avatar has been reset to default by the bot owner.'
              : `Your new anonymous avatar has been approved by the bot owner and is now active!\n• [View Avatar](${updatedUser.avatar_url})`
          )
          .setTimestamp();

        if (updatedUser.avatar_url) {
          userNotice.setThumbnail(updatedUser.avatar_url);
        }

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
   * Direct avatar update (resolves permanent URL and updates in database).
   */
  async updateAvatar({ client, discordId, avatarUrl, attachmentFile = null }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'You are not registered yet. Use `/register` first.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been suspended from using AnonBot.' };
    }

    let cleanUrl = null;
    if (attachmentFile || avatarUrl) {
      const resolved = await this.resolvePermanentAvatarUrl(client, discordId, avatarUrl, attachmentFile);
      if (!resolved) {
        return { success: false, error: 'Could not resolve avatar image.' };
      }

      const validation = validateAvatarUrl(resolved);
      if (!validation.valid) {
        return { success: false, error: validation.error };
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
