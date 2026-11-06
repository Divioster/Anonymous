'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const moderationService = require('../../services/moderationService');
const roleService = require('../../services/roleService');
const { isGlobalAdmin } = require('../../utils/permissions');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed, formatDate } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Global user moderation commands (Bot Owner only)')
    .setDefaultMemberPermissions(0)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ban')
        .setDescription('Ban an anonymous user globally by Discord ID, nickname, or internal ID')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Discord ID, nickname, or internal user ID')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Reason for the ban')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unban')
        .setDescription('Unban a previously banned user')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Discord ID, nickname, or internal user ID')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('View account details and identity of an anonymous user')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Discord ID, nickname, or internal user ID')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only the authorized bot owner can perform global user moderation.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getString('target');

    if (subcommand === 'ban') {
      const reason = interaction.options.getString('reason') || 'Violation of chat policies';
      const result = moderationService.banUser({
        targetIdentifier: target,
        reason,
        bannedBy: interaction.user.id
      });

      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('Ban Failed', result.error)],
          flags: MessageFlags.Ephemeral
        });
      }

      roleService.syncUserAcrossGuilds(interaction.client, result.user.discord_id, false).catch(() => null);

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            'User Banned',
            `User **${result.user.nickname}** (\`${result.user.discord_id}\`) has been banned globally.\n` +
            `• **Reason:** ${reason}`
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (subcommand === 'unban') {
      const result = moderationService.unbanUser({
        targetIdentifier: target,
        unbannedBy: interaction.user.id
      });

      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('Unban Failed', result.error)],
          flags: MessageFlags.Ephemeral
        });
      }

      roleService.syncUserAcrossGuilds(interaction.client, result.user.discord_id, true).catch(() => null);

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            'User Unbanned',
            `User **${result.user.nickname}** (\`${result.user.discord_id}\`) has been unbanned.`
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (subcommand === 'info') {
      const result = moderationService.getUserInfo(target);
      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('User Not Found', result.error)],
          flags: MessageFlags.Ephemeral
        });
      }

      const u = result.user;
      const banInfo = result.ban
        ? `🚨 **Banned:** Yes\n• Reason: ${result.ban.reason}\n• Banned By: <@${result.ban.banned_by}>\n• Banned At: ${formatDate(result.ban.created_at)}`
        : '✅ **Banned:** No';

      const embed = createInfoEmbed(
        `User Profile: ${u.nickname}`,
        `• **Internal ID:** \`${u.id}\`\n` +
        `• **Discord ID:** \`${u.discord_id}\` (<@${u.discord_id}>)\n` +
        `• **Registered At:** ${formatDate(u.registered_at)}\n` +
        `• **Nickname Changed At:** ${u.nickname_changed_at ? formatDate(u.nickname_changed_at) : 'Never'}\n` +
        `• **Avatar URL:** ${u.avatar_url ? `[Custom Avatar](${u.avatar_url})` : 'Default'}\n\n` +
        `${banInfo}\n\n` +
        `• **Recent Message Dispatches:** ${result.recentMessages.length}`
      );

      if (u.avatar_url) {
        embed.setThumbnail(u.avatar_url);
      }

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

