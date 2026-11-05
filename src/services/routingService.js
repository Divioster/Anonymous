'use strict';

const guildRepo = require('../database/repositories/guilds');
const moderationRepo = require('../database/repositories/moderation');
const { checkBotChannelPermissions } = require('../utils/permissions');

const routingService = {
  /**
   * Sets up or updates anonymous messaging channel for a guild.
   */
  async setupGuildChannel({ guild, channel, configuredBy, clientUser }) {
    if (!guild || !channel) {
      return { success: false, error: 'Invalid guild or channel.' };
    }

    if (channel.guild.id !== guild.id) {
      return { success: false, error: 'The selected channel does not belong to the selected guild.' };
    }

    // 1. Verify bot permissions in the channel
    const permCheck = checkBotChannelPermissions(channel, clientUser);
    if (!permCheck.hasPermissions) {
      return {
        success: false,
        error: `Bot is missing required permissions in <#${channel.id}>: ${permCheck.missing.join(', ')}`
      };
    }

    // 2. Find or create a Webhook in the target channel
    let webhook = null;
    try {
      const existingWebhooks = await channel.fetchWebhooks();
      webhook = existingWebhooks.find((wh) => wh.owner && wh.owner.id === clientUser.id);

      if (!webhook) {
        webhook = await channel.createWebhook({
          name: 'AnonBot Relay',
          reason: 'Anonymous chat message routing'
        });
      }
    } catch (err) {
      console.warn(`[Webhook Setup] Could not manage webhooks in ${channel.name}: ${err.message}`);
      // Proceed without webhook if channel permissions allow direct sending as fallback
    }

    // 3. Save to database
    const saved = guildRepo.upsertGuild({
      guildId: guild.id,
      guildName: guild.name,
      guildIcon: guild.iconURL() || null,
      channelId: channel.id,
      webhookId: webhook ? webhook.id : null,
      webhookToken: webhook ? webhook.token : null,
      configuredBy
    });

    moderationRepo.logAudit({
      actorId: configuredBy,
      action: 'GUILD_SETUP',
      targetId: guild.id,
      metadata: { channelId: channel.id, webhookId: webhook ? webhook.id : null }
    });

    return {
      success: true,
      guildConfig: saved,
      webhookCreated: Boolean(webhook)
    };
  },

  /**
   * Disables anonymous messaging for a guild.
   */
  disableGuild(guildId, actorId) {
    const existing = guildRepo.findByGuildId(guildId);
    if (!existing) {
      return { success: false, error: 'Guild is not configured.' };
    }

    guildRepo.setEnabled(guildId, false);

    moderationRepo.logAudit({
      actorId,
      action: 'GUILD_DISABLED',
      targetId: guildId
    });

    return { success: true };
  },

  /**
   * Retrieves active participating guilds.
   */
  getAvailableGuilds(client) {
    const records = guildRepo.getAllEnabledGuilds();
    return records
      .map((rec) => {
        const guild = client.guilds.cache.get(rec.guild_id);
        return {
          id: rec.guild_id,
          name: guild ? guild.name : (rec.guild_name || `Server ${rec.guild_id}`),
          icon: guild ? guild.iconURL() : rec.guild_icon,
          channelId: rec.channel_id
        };
      })
      .filter((g) => Boolean(client.guilds.cache.get(g.id))); // Only guilds bot is currently in
  },

  /**
   * Retrieves config for a guild.
   */
  getGuildConfig(guildId) {
    return guildRepo.findByGuildId(guildId);
  }
};

module.exports = routingService;

