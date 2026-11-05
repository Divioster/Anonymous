'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const routingService = require('../services/routingService');
const { isGlobalAdmin } = require('../utils/permissions');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('disable')
    .setDescription('Disable anonymous messaging for a server (Bot Owner only)')
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName('guild_id')
        .setDescription('Optional Guild ID to disable (defaults to current server)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only the authorized bot owner can disable server messaging.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const guildId = interaction.options.getString('guild_id') || (interaction.guild ? interaction.guild.id : null);
    if (!guildId) {
      return interaction.reply({
        embeds: [createErrorEmbed('Guild Required', 'Please run this command in a server or provide a `guild_id`.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const result = routingService.disableGuild(guildId, interaction.user.id);
    if (!result.success) {
      return interaction.reply({
        embeds: [createErrorEmbed('Failed', result.error)],
        flags: MessageFlags.Ephemeral
      });
    }

    return interaction.reply({
      embeds: [createSuccessEmbed('Server Disabled', `Anonymous messaging has been disabled for server ID \`${guildId}\`.`)],
      flags: MessageFlags.Ephemeral
    });
  }
};

