'use strict';

const { SlashCommandBuilder } = require('discord.js');
const registrationService = require('../services/registrationService');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('Manage your AnonBot account')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Permanently delete your anonymous account and registered nickname')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'delete') {
      const result = registrationService.deleteAccount(interaction.user.id);
      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed('Deletion Failed', result.error)],
          ephemeral: true
        });
      }

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            'Account Deleted',
            'Your AnonBot account and registered nickname have been deleted.\n' +
            'You may register again at any time with `/register`.'
          )
        ],
        ephemeral: true
      });
    }
  }
};

