'use strict';

const { SlashCommandBuilder } = require('discord.js');
const moderationService = require('../../services/moderationService');
const { isGlobalAdmin } = require('../../utils/permissions');
const { createInfoEmbed, createErrorEmbed } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Display global AnonBot system statistics (Bot Owner only)'),

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only authorized bot owners can view bot statistics.')],
        ephemeral: true
      });
    }

    const stats = moderationService.getStats();

    const embed = createInfoEmbed(
      'AnonBot System Statistics',
      `• **Total Registered Users:** ${stats.totalUsers}\n` +
      `• **Banned Users:** ${stats.bannedUsers}\n` +
      `• **Active Configured Servers:** ${stats.activeGuilds} / ${stats.totalGuilds}\n` +
      `• **Total Anonymous Messages Dispatched:** ${stats.totalMessages}\n` +
      `• **Successfully Delivered:** ${stats.deliveredMessages}\n` +
      `• **Bot Connected Guilds:** ${interaction.client.guilds.cache.size}\n` +
      `• **Node.js Version:** ${process.version}\n` +
      `• **Process Uptime:** ${Math.floor(process.uptime() / 60)} minutes`
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};

