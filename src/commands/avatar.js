'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const registrationService = require('../services/registrationService');
const attachmentService = require('../services/attachmentService');
const { validateAvatarUrl } = require('../utils/validation');
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
        .addAttachmentOption((option) =>
          option
            .setName('file')
            .setDescription('Upload a JPG or PNG image file to use as your avatar')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('url')
            .setDescription('Direct image URL (.jpg, .jpeg, or .png)')
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
      const fileOption = interaction.options.getAttachment('file');
      const urlOption = interaction.options.getString('url');

      if (!fileOption && !urlOption) {
        return interaction.reply({
          embeds: [createErrorEmbed('Input Required', 'Please provide either a JPG/PNG image file or a direct image URL.')],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Validate attachment format (must be JPG or PNG)
      if (fileOption) {
        const fileValidation = await attachmentService.validateAvatarFile(fileOption);
        if (!fileValidation.valid) {
          return interaction.editReply({
            embeds: [createErrorEmbed('Invalid Image File', fileValidation.error)]
          });
        }
      }

      // Validate URL format (must be JPG or PNG)
      if (urlOption && !fileOption) {
        const urlValidation = validateAvatarUrl(urlOption);
        if (!urlValidation.valid) {
          return interaction.editReply({
            embeds: [createErrorEmbed('Invalid Image URL', urlValidation.error)]
          });
        }
      }

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
        `• **Format:** JPG / PNG\n` +
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

