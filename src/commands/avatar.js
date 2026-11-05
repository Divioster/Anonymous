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

      let targetUrl = null;
      if (fileOption) {
        targetUrl = fileOption.url;
      } else if (urlOption) {
        targetUrl = urlOption;
      } else {
        return interaction.reply({
          embeds: [createErrorEmbed('Input Required', 'Please provide either an image URL or upload an image file.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const result = registrationService.updateAvatar({
        discordId: interaction.user.id,
        avatarUrl: targetUrl
      });

      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('Failed to Set Avatar', result.error)],
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = createSuccessEmbed(
        'Avatar Updated',
        `Your anonymous avatar for **${user.nickname}** has been updated successfully!`
      ).setThumbnail(result.user.avatar_url);

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    }

    if (subcommand === 'remove') {
      const result = registrationService.updateAvatar({
        discordId: interaction.user.id,
        avatarUrl: null
      });

      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('Error', result.error)],
          flags: MessageFlags.Ephemeral
        });
      }

      return interaction.reply({
        embeds: [createSuccessEmbed('Avatar Removed', 'Your avatar has been reset to the default anonymous icon.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

