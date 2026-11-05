'use strict';

const { SlashCommandBuilder } = require('discord.js');
const moderationService = require('../../services/moderationService');
const { isGlobalAdmin } = require('../../utils/permissions');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed, formatDate } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Message lookup and moderation (Bot Owner only)')
    .setDefaultMemberPermissions(0)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('lookup')
        .setDescription('Reveal message sender identity and audit info')
        .addStringOption((option) =>
          option
            .setName('identifier')
            .setDescription('Message UUID or Discord Message ID')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete an anonymous message from Discord channel and mark as deleted')
        .addStringOption((option) =>
          option
            .setName('identifier')
            .setDescription('Message UUID or Discord Message ID')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only authorized bot owners can look up message senders.')],
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const identifier = interaction.options.getString('identifier');

    if (subcommand === 'lookup') {
      const result = moderationService.lookupMessage(identifier);
      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('Lookup Failed', result.error)],
          ephemeral: true
        });
      }

      const m = result.message;
      const s = result.sender;
      const atts = result.attachments.map((a) => `• [${a.original_filename}](${a.url}) (${Math.round(a.file_size / 1024)} KB)`).join('\n');

      const embed = createInfoEmbed(
        `Message Audit: ${m.message_uuid}`,
        `**Content:**\n${m.content || '*(No text content)*'}\n\n` +
        `**Sender Identity (Confidential):**\n` +
        `• **Nickname:** ${s ? s.nickname : 'Unknown'}\n` +
        `• **Discord ID:** \`${s ? s.discord_id : 'N/A'}\` (<@${s ? s.discord_id : '0'}>)\n` +
        `• **Account Status:** ${s && s.is_banned ? '🚨 Banned' : '✅ Active'}\n\n` +
        `**Dispatch Details:**\n` +
        `• **Target Server:** \`${m.guild_id}\`\n` +
        `• **Target Channel:** <#${m.channel_id}>\n` +
        `• **Discord Message ID:** \`${m.discord_message_id || 'None'}\`\n` +
        `• **Delivery Status:** \`${m.delivery_status}\`\n` +
        `• **Sent At:** ${formatDate(m.created_at)}\n` +
        (atts ? `\n**Attachments (${result.attachments.length}):**\n${atts}` : '')
      );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    if (subcommand === 'delete') {
      await interaction.deferReply({ ephemeral: true });

      const result = await moderationService.deleteMessage({
        client: interaction.client,
        messageIdentifier: identifier,
        deletedBy: interaction.user.id
      });

      if (!result.success) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Delete Failed', result.error)]
        });
      }

      return interaction.editReply({
        embeds: [
          createSuccessEmbed(
            'Message Deleted',
            `Message \`${result.messageUuid}\` has been removed from the channel and flagged in the audit log.`
          )
        ]
      });
    }
  }
};

