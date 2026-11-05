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

    await interaction.deferReply({ ephemeral: true });

    const result = await registrationService.requestRegistration({
      client: interaction.client,
      discordId: interaction.user.id,
      nickname,
      avatarUrl
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
      `• **Profile Picture:** ${result.avatarUrl ? `[Custom Avatar](${result.avatarUrl})` : 'Default'}\n\n` +
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

