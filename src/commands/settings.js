'use strict';

const { SlashCommandBuilder } = require('discord.js');
const routingService = require('../services/routingService');
const { isGlobalAdmin, checkBotChannelPermissions } = require('../utils/permissions');
const { createInfoEmbed, createErrorEmbed, formatDate } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View anonymous messaging settings for a guild (Bot Owner only)')
    .addStringOption((option) =>
      option
        .setName('guild_id')
        .setDescription('Optional Guild ID to inspect (defaults to current server)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only the authorized bot owner can view server settings.')],
        ephemeral: true
      });
    }

    const guildId = interaction.options.getString('guild_id') || (interaction.guild ? interaction.guild.id : null);
    if (!guildId) {
      return interaction.reply({
        embeds: [createErrorEmbed('Guild Required', 'Please run this command inside a server or provide a `guild_id`.')],
        ephemeral: true
      });
    }

    const config = routingService.getGuildConfig(guildId);
    if (!config) {
      return interaction.reply({
        embeds: [createErrorEmbed('Not Configured', `Server \`${guildId}\` is not configured for anonymous messaging.`)],
        ephemeral: true
      });
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    const channel = guild ? guild.channels.cache.get(config.channel_id) : null;
    const permStatus = channel ? checkBotChannelPermissions(channel, interaction.client.user) : null;

    const embed = createInfoEmbed(
      `AnonBot Settings: ${guild ? guild.name : `Server ${guildId}`}`,
      `• **Enabled:** ${config.enabled ? 'Yes' : 'No'}\n` +
      `• **Channel:** ${channel ? `<#${channel.id}>` : `Unknown (${config.channel_id})`}\n` +
      `• **Webhook ID:** ${config.webhook_id ? `\`${config.webhook_id}\`` : 'None'}\n` +
      `• **Configured By:** <@${config.configured_by}>\n` +
      `• **Configured At:** ${formatDate(config.configured_at)}\n` +
      `• **Channel Permissions:** ${permStatus && permStatus.hasPermissions ? 'All Granted' : (permStatus ? `Missing: ${permStatus.missing.join(', ')}` : 'Channel Inaccessible')}`
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};

