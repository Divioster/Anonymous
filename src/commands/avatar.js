'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const registrationService = require('../services/registrationService');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Manage your anonymous profile picture')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View your current anonymous profile picture')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set a custom profile picture for your anonymous messages')
        .addStringOption((option) =>
          option
            .setName('url')
            .setDescription('Direct image URL (.png, .jpg, .webp, .gif)')
            .setRequired(false)
        )
        .addAttachmentOption((option) =>
          option
            .setName('file')
            .setDescription('Upload an image file to use as your avatar')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove your custom avatar and revert to default')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const user = registrationService.getUser(interaction.user.id);

    if (!user) {
      return interaction.reply({
        embeds: [createErrorEmbed('Not Registered', 'You must register first with `/register`.')],
        flags: MessageFlags.Ephemeral
      });
    }

    if (subcommand === 'view') {
      const avatarUrl = user.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
      const embed = createInfoEmbed(
        'Your Anonymous Avatar',
        user.avatar_url
          ? `Current custom avatar for **${user.nickname}**:`
          : `Default avatar in use for **${user.nickname}**.`
      ).setThumbnail(avatarUrl);

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    }

    if (subcommand === 'set') {
      const urlOption = interaction.options.getString('url');
      const fileOption = interaction.options.getAttachment('file');

      if (!urlOption && !fileOption) {
        return interaction.reply({
          embeds: [createErrorEmbed('Input Required', 'Please provide either an image URL or upload an image file.')],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await registrationService.requestAvatarChange({
        client: interaction.client,
        discordId: interaction.user.id,
        avatarUrl: urlOption,
        attachmentFile: fileOption,
        isRemove: false
      });

      if (!result.success) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Failed to Submit Request', result.error)]
        });
      }

      const embed = createSuccessEmbed(
        'Avatar Update Request Submitted',
        `Your request to update your anonymous avatar for **${user.nickname}** has been sent to the bot owner for approval.\n\n` +
        `• **Preview:** [New Avatar Link](${result.newAvatar})\n` +
        `• **Status:** Pending Owner Review\n\n` +
        `You will receive a direct message once the bot owner has accepted or declined your request.`
      ).setThumbnail(result.newAvatar);

      return interaction.editReply({
        embeds: [embed]
      });
    }

    if (subcommand === 'remove') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await registrationService.requestAvatarChange({
        client: interaction.client,
        discordId: interaction.user.id,
        isRemove: true
      });

      if (!result.success) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Error', result.error)]
        });
      }

      return interaction.editReply({
        embeds: [
          createSuccessEmbed(
            'Avatar Removal Request Submitted',
            `Your request to reset your anonymous avatar for **${user.nickname}** to default has been sent to the bot owner for approval.\n\n` +
            `• **Status:** Pending Owner Review\n\n` +
            `You will receive a direct message once the bot owner has accepted or declined your request.`
          )
        ]
      });
    }
  }
};

