'use strict';

const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const routingService = require('../services/routingService');
const { isGlobalAdmin } = require('../utils/permissions');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure destination channel for anonymous messaging (Bot Owner only)')
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Text channel where anonymous messages will be delivered')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('guild_id')
        .setDescription('Optional Guild ID (if running command from DM or targeting another server)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Owner-only check
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only the authorized bot owner can configure AnonBot.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const channelOption = interaction.options.getChannel('channel');
    const guildIdOption = interaction.options.getString('guild_id');

    let targetGuild = interaction.guild;
    if (guildIdOption) {
      targetGuild = interaction.client.guilds.cache.get(guildIdOption);
      if (!targetGuild) {
        return interaction.reply({
          embeds: [createErrorEmbed('Guild Not Found', `Bot is not in server ID \`${guildIdOption}\`.`)],
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (!targetGuild) {
      return interaction.reply({
        embeds: [createErrorEmbed('Guild Required', 'Please run this command inside a server or provide a valid `guild_id`.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const channel = targetGuild.channels.cache.get(channelOption.id);
    if (!channel) {
      return interaction.reply({
        embeds: [createErrorEmbed('Channel Not Found', `Channel <#${channelOption.id}> was not found in ${targetGuild.name}.`)],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await routingService.setupGuildChannel({
      guild: targetGuild,
      channel,
      configuredBy: interaction.user.id,
      clientUser: interaction.client.user
    });

    if (!result.success) {
      return interaction.editReply({
        embeds: [createErrorEmbed('Configuration Failed', result.error)]
      });
    }

    return interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Setup Complete',
          `Anonymous messaging has been successfully configured for **${targetGuild.name}**!\n\n` +
          `• **Channel:** <#${channel.id}>\n` +
          `• **Webhook Integration:** ${result.webhookCreated ? 'Active (custom nickname & pfp support enabled)' : 'Channel Fallback'}\n` +
          `• **Status:** Active & Accepting Messages`
        )
      ]
    });
  }
};

