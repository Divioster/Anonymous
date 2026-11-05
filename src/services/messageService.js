'use strict';

const { WebhookClient, EmbedBuilder } = require('discord.js');
const messageRepo = require('../database/repositories/messages');
const guildRepo = require('../database/repositories/guilds');
const userRepo = require('../database/repositories/users');
const moderationRepo = require('../database/repositories/moderation');
const config = require('../config/config');
const attachmentService = require('./attachmentService');
const { validateMessageContent } = require('../utils/validation');
const { generateUuid } = require('../utils/helpers');

const messageService = {
  /**
   * Dispatches an anonymous message to the target guild.
   */
  async sendMessage({ client, discordUserId, targetGuildId, content, rawAttachments = [] }) {
    // 1. Verify user registration & ban status
    const user = userRepo.findByDiscordId(discordUserId);
    if (!user) {
      return { success: false, error: 'You must register first with `/register` before sending messages.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been banned from sending anonymous messages.' };
    }

    // 2. Check rate limits
    const rateCheck = moderationRepo.checkRateLimits(user.id, 'send_message');
    if (rateCheck.limited) {
      return { success: false, error: rateCheck.reason };
    }

    // 3. Validate attachments if any
    let validatedAttachments = [];
    if (rawAttachments && (rawAttachments.length > 0 || (rawAttachments.size && rawAttachments.size > 0))) {
      const attResult = await attachmentService.validateAttachments(rawAttachments);
      if (!attResult.valid) {
        return { success: false, error: attResult.error };
      }
      validatedAttachments = attResult.attachments;
    }

    // 4. Validate message content
    const contentResult = validateMessageContent(content, validatedAttachments.length > 0);
    if (!contentResult.valid) {
      return { success: false, error: contentResult.error };
    }
    const cleanContent = contentResult.content;

    // 5. Verify target guild configuration
    const guildConfig = guildRepo.findByGuildId(targetGuildId);
    if (!guildConfig || !guildConfig.enabled) {
      return { success: false, error: 'The selected server is not currently accepting anonymous messages.' };
    }

    const guild = client.guilds.cache.get(targetGuildId);
    if (!guild) {
      return { success: false, error: 'The bot is no longer in the destination server.' };
    }

    const channel = guild.channels.cache.get(guildConfig.channel_id);
    if (!channel) {
      return { success: false, error: 'The configured channel on the destination server was not found.' };
    }

    // 6. Create message record in database (PENDING)
    const messageUuid = generateUuid();
    const createdMsg = messageRepo.createMessage({
      messageUuid,
      userId: user.id,
      guildId: targetGuildId,
      channelId: channel.id,
      content: cleanContent,
      deliveryStatus: 'PENDING'
    });

    // 7. Deliver message (Webhook with custom nickname and avatar, or channel fallback)
    let discordMessageId = null;
    let deliverySuccess = false;
    const discordFiles = attachmentService.createDiscordFiles(validatedAttachments);
    const avatarUrl = user.avatar_url || config.defaultAvatarUrl;

    try {
      let webhookClient = null;
      if (guildConfig.webhook_id && guildConfig.webhook_token) {
        webhookClient = new WebhookClient({
          id: guildConfig.webhook_id,
          token: guildConfig.webhook_token
        });
      }

      // Self-heal webhook if missing or not configured in database
      if (!webhookClient) {
        try {
          const webhooks = await channel.fetchWebhooks().catch(() => null);
          let wh = webhooks?.find((w) => w.token && w.owner?.id === client.user.id) || webhooks?.find((w) => w.token);

          if (!wh) {
            wh = await channel.createWebhook({
              name: 'AnonBot Relay',
              reason: 'Automatic self-healing for anonymous messaging'
            }).catch(() => null);
          }

          if (wh && wh.token) {
            guildRepo.updateWebhook(targetGuildId, wh.id, wh.token);
            webhookClient = new WebhookClient({ id: wh.id, token: wh.token });
            console.log(`[Message Delivery] Webhook self-healed on #${channel.name} (${wh.id})`);
          }
        } catch (whHealErr) {
          console.warn(`[Message Delivery] Webhook self-healing failed: ${whHealErr.message}`);
        }
      }

      if (webhookClient) {
        try {
          const sent = await webhookClient.send({
            content: cleanContent || undefined,
            username: user.nickname,
            avatarURL: avatarUrl,
            avatar_url: avatarUrl,
            files: discordFiles,
            allowedMentions: { parse: [] } // Disable all mentions (@everyone, @here, roles, users)
          });
          discordMessageId = sent.id;
          deliverySuccess = true;
        } catch (webhookErr) {
          console.warn(`[Message Delivery] Webhook delivery failed: ${webhookErr.message}. Falling back to channel send.`);
        }
      }

      // Fallback: send directly through bot if webhook failed or wasn't configured
      if (!deliverySuccess) {
        const embed = new EmbedBuilder()
          .setAuthor({
            name: user.nickname,
            iconURL: avatarUrl
          })
          .setColor(0x2B2D31)
          .setTimestamp();

        if (cleanContent) {
          embed.setDescription(cleanContent);
        }

        const sent = await channel.send({
          embeds: [embed],
          files: discordFiles,
          allowedMentions: { parse: [] }
        });
        discordMessageId = sent.id;
        deliverySuccess = true;
      }
    } catch (deliveryErr) {
      console.error(`[Message Delivery Error] Guild ${targetGuildId}:`, deliveryErr);
      messageRepo.updateDelivery(createdMsg.id, null, 'FAILED');
      return {
        success: false,
        error: `Failed to deliver message: ${deliveryErr.message}`
      };
    }

    // 8. Update database with delivery info & attachments
    messageRepo.updateDelivery(createdMsg.id, discordMessageId, 'DELIVERED');

    for (const att of validatedAttachments) {
      messageRepo.addAttachment({
        messageId: createdMsg.id,
        originalFilename: att.originalFilename,
        mimeType: att.mimeType,
        fileSize: att.fileSize,
        discordAttachmentId: att.discordAttachmentId,
        url: att.url
      });
    }

    // Record rate limit action
    moderationRepo.recordRateLimitAction(user.id, 'send_message');

    return {
      success: true,
      messageUuid,
      discordMessageId,
      guildName: guild.name,
      channelName: channel.name,
      nickname: user.nickname
    };
  }
};

module.exports = messageService;

