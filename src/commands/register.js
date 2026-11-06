'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const registrationService = require('../services/registrationService');
const attachmentService = require('../services/attachmentService');
const { validateAvatarUrl } = require('../utils/validation');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register your global anonymous nickname and optional avatar.')
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('Your unique anonymous nickname (3-24 alphanumeric characters, hyphens, underscores)')
        .setRequired(true)
    )
    .addAttachmentOption((option) =>
      option
        .setName('avatar_file')
        .setDescription('Optional JPG or PNG image file to upload as your profile picture')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('avatar_url')
        .setDescription('Optional direct image URL (.jpg, .jpeg, or .png)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const nickname = interaction.options.getString('nickname');
    const avatarFile = interaction.options.getAttachment('avatar_file');
    const avatarUrl = interaction.options.getString('avatar_url');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Validate avatar file if provided (strictly JPG or PNG)
    if (avatarFile) {
      const fileValidation = await attachmentService.validateAvatarFile(avatarFile);
      if (!fileValidation.valid) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Invalid Avatar File', fileValidation.error)]
        });
      }
    }

    // Validate avatar URL if provided (strictly JPG or PNG)
    if (avatarUrl && !avatarFile) {
      const urlValidation = validateAvatarUrl(avatarUrl);
      if (!urlValidation.valid) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Invalid Avatar URL', urlValidation.error)]
        });
      }
    }

    let resolvedAvatar = null;
    if (avatarFile || avatarUrl) {
      resolvedAvatar = await registrationService.resolvePermanentAvatarUrl(
        interaction.client,
        interaction.user.id,
        avatarUrl,
        avatarFile
      );
    }

    const result = await registrationService.requestRegistration({
      client: interaction.client,
      discordId: interaction.user.id,
      nickname,
      avatarUrl: resolvedAvatar
    });

    if (!result.success) {
      return interaction.editReply({
        embeds: [createErrorEmbed('Registration Failed', result.error)]
      });
    }

    const embed = createSuccessEmbed(
      'Registration Request Submitted',
      `Your request to register the anonymous nickname **${result.nickname}** has been sent to the bot owner for approval.\n\n` +
      `• **Status:** Pending Owner Review\n` +
      `• **Profile Picture:** ${result.avatarUrl ? `[Custom Avatar (${avatarFile ? 'File' : 'URL'})](${result.avatarUrl})` : 'Default'}\n\n` +
      `You will receive a direct message once the bot owner has accepted or declined your request.`
    );

    if (result.avatarUrl) {
      embed.setThumbnail(result.avatarUrl);
    }

    return interaction.editReply({
      embeds: [embed]
    });
  }
};

