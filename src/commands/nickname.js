'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const registrationService = require('../services/registrationService');
const attachmentService = require('../services/attachmentService');
const { validateAvatarUrl } = require('../utils/validation');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed, formatDate } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Manage your global anonymous nickname')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View your current registered anonymous nickname')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('change')
        .setDescription('Request a nickname and/or avatar change (Requires Owner Approval)')
        .addStringOption((option) =>
          option
            .setName('new_nickname')
            .setDescription('New anonymous nickname (3-24 characters)')
            .setRequired(false)
        )
        .addAttachmentOption((option) =>
          option
            .setName('avatar_file')
            .setDescription('Optional new JPG or PNG image file for your avatar')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('avatar_url')
            .setDescription('Optional direct image URL (.jpg, .jpeg, or .png)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      const user = registrationService.getUser(interaction.user.id);
      if (!user) {
        return interaction.reply({
          embeds: [createErrorEmbed('Not Registered', 'You are not registered yet. Use `/register` to create a nickname.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = createInfoEmbed(
        'Your Anonymous Profile',
        `**Nickname:** ${user.nickname}\n` +
        `**Registered At:** ${formatDate(user.registered_at)}\n` +
        `**Last Nickname Change:** ${user.nickname_changed_at ? formatDate(user.nickname_changed_at) : 'Never'}\n` +
        `**Profile Picture:** ${user.avatar_url ? `[Custom Avatar](${user.avatar_url})` : 'Default'}`
      );

      if (user.avatar_url) {
        embed.setThumbnail(user.avatar_url);
      }

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    }

    if (subcommand === 'change') {
      const newNickname = interaction.options.getString('new_nickname');
      const avatarFileOption = interaction.options.getAttachment('avatar_file');
      const avatarUrlOption = interaction.options.getString('avatar_url');

      if (!newNickname && !avatarUrlOption && !avatarFileOption) {
        return interaction.reply({
          embeds: [createErrorEmbed('Input Required', 'Please provide a new nickname, a JPG/PNG avatar file, or an avatar URL.')],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Validate avatar file if provided (strictly JPG or PNG)
      if (avatarFileOption) {
        const fileValidation = await attachmentService.validateAvatarFile(avatarFileOption);
        if (!fileValidation.valid) {
          return interaction.editReply({
            embeds: [createErrorEmbed('Invalid Avatar File', fileValidation.error)]
          });
        }
      }

      // Validate avatar URL if provided (strictly JPG or PNG)
      if (avatarUrlOption && !avatarFileOption) {
        const urlValidation = validateAvatarUrl(avatarUrlOption);
        if (!urlValidation.valid) {
          return interaction.editReply({
            embeds: [createErrorEmbed('Invalid Avatar URL', urlValidation.error)]
          });
        }
      }

      let resolvedAvatar = null;
      if (avatarUrlOption || avatarFileOption) {
        resolvedAvatar = await registrationService.resolvePermanentAvatarUrl(
          interaction.client,
          interaction.user.id,
          avatarUrlOption,
          avatarFileOption
        );
      }

      const result = await registrationService.requestNicknameChange({
        client: interaction.client,
        discordId: interaction.user.id,
        newNickname,
        avatarUrl: resolvedAvatar
      });

      if (!result.success) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Change Request Failed', result.error)]
        });
      }

      const details = [];
      if (result.nicknameChanged) {
        details.push(`• **Nickname Change:** **${result.oldNickname}** ➔ **${result.newNickname}**`);
      }
      if (result.avatarChanged) {
        details.push(`• **Avatar Update:** [New Avatar Preview](${result.newAvatar})`);
      }

      const embed = createSuccessEmbed(
        'Profile Update Request Submitted',
        `Your request has been sent to the bot owner for approval.\n\n` +
        details.join('\n') +
        `\n\n• **Status:** Pending Owner Review\n` +
        `You will receive a direct message once the bot owner has accepted or declined your request.`
      );

      if (result.avatarChanged && result.newAvatar) {
        embed.setThumbnail(result.newAvatar);
      }

      return interaction.editReply({
        embeds: [embed]
      });
    }
  }
};

