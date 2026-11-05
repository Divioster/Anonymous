'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const moderationService = require('../../services/moderationService');
const routingService = require('../../services/routingService');
const userRepo = require('../../database/repositories/users');
const { isGlobalAdmin } = require('../../utils/permissions');
const { createInfoEmbed, createErrorEmbed, formatDate } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel-users')
    .setDescription('View registered users and their nicknames for a configured channel (Bot Owner only)')
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName('guild_id')
        .setDescription('Optional Guild ID (defaults to current server if inside one)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only the bot owner can view registered users in a channel.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const guildId = interaction.options.getString('guild_id') || (interaction.guild ? interaction.guild.id : null);
    if (!guildId) {
      return interaction.reply({
        embeds: [createErrorEmbed('Guild Required', 'Please run this command in a server or specify a `guild_id`.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const config = routingService.getGuildConfig(guildId);
    if (!config) {
      return interaction.reply({
        embeds: [createErrorEmbed('Not Configured', `Server \`${guildId}\` is not configured for anonymous messaging.`)],
        flags: MessageFlags.Ephemeral
      });
    }

    const channelUsers = moderationService.getChannelUsers(guildId);
    const guild = interaction.client.guilds.cache.get(guildId);

    if (channelUsers.length === 0) {
      // If no messages sent yet, also show all registered users summary
      const allUsers = userRepo.getAllUsers();
      const list = allUsers.slice(0, 20).map((u) => `• **${u.nickname}** (<@${u.discord_id}>) — Reg: ${formatDate(u.registered_at)}`).join('\n');

      return interaction.reply({
        embeds: [
          createInfoEmbed(
            `Registered Users for ${guild ? guild.name : guildId}`,
            `No messages have been posted in channel <#${config.channel_id}> yet.\n\n` +
            `**Globally Registered Users (${allUsers.length}):**\n` +
            (list || 'None yet.')
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const userLines = channelUsers.map((u) => {
      const fullUser = userRepo.findById(u.userId);
      const discordId = fullUser ? fullUser.discord_id : 'Unknown';
      return `• **${u.nickname}** (<@${discordId}>) — Sent: ${u.messageCount} msg(s) — Last: ${formatDate(u.lastActive)}`;
    }).join('\n');

    const embed = createInfoEmbed(
      `Active Anonymous Users: ${guild ? guild.name : guildId}`,
      `**Target Channel:** <#${config.channel_id}>\n` +
      `**Participants who have posted:**\n\n` +
      userLines
    );

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
};

