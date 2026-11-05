'use strict';

const { SlashCommandBuilder } = require('discord.js');
const registrationService = require('../services/registrationService');
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
    .addStringOption((option) =>
      option
        .setName('avatar_url')
        .setDescription('Optional direct image URL for your anonymous profile picture (.png, .jpg, .webp, .gif)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const nickname = interaction.options.getString('nickname');
    const avatarUrl = interaction.options.getString('avatar_url');

    const result = registrationService.registerUser({
      discordId: interaction.user.id,
      nickname,
      avatarUrl
    });

    if (!result.success) {
      return interaction.reply({
        embeds: [createErrorEmbed('Registration Failed', result.error)],
        ephemeral: true
      });
    }

    const embed = createSuccessEmbed(
      'Registration Successful',
      `You are now registered as **${result.user.nickname}**!\n\n` +
      `• Your nickname is global across all participating servers.\n` +
      `• Your identity is protected and commands are kept ephemeral.\n` +
      `• Profile Picture: ${result.user.avatar_url ? `[Custom Avatar](${result.user.avatar_url})` : 'Default avatar'}\n\n` +
      `Use \`/send\` to send anonymous messages or \`/servers\` to view available servers.`
    );

    if (result.user.avatar_url) {
      embed.setThumbnail(result.user.avatar_url);
    }

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};

