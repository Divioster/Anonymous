'use strict';

const { SlashCommandBuilder } = require('discord.js');
const registrationService = require('../services/registrationService');
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
        .setDescription('Change your registered anonymous nickname (7-day cooldown)')
        .addStringOption((option) =>
          option
            .setName('new_nickname')
            .setDescription('Your new anonymous nickname (3-24 characters)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      const user = registrationService.getUser(interaction.user.id);
      if (!user) {
        return interaction.reply({
          embeds: [createErrorEmbed('Not Registered', 'You are not registered yet. Use `/register` to create a nickname.')],
          ephemeral: true
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
        ephemeral: true
      });
    }

    if (subcommand === 'change') {
      const newNickname = interaction.options.getString('new_nickname');
      const result = registrationService.changeNickname({
        discordId: interaction.user.id,
        newNickname
      });

      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('Nickname Change Failed', result.error)],
          ephemeral: true
        });
      }

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            'Nickname Changed',
            `Your nickname has been updated to **${result.user.nickname}**!\n` +
            `*Note: Nicknames can only be changed once every 7 days.*`
          )
        ],
        ephemeral: true
      });
    }
  }
};

