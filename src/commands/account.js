'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await registrationService.requestAccountDeletion({
        client: interaction.client,
        discordId: interaction.user.id
      });

      if (!result.success) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Deletion Failed', result.error)]
        });
      }

      return interaction.editReply({
        embeds: [
          createSuccessEmbed(
            'Deletion Request Submitted',
            `Your request to delete your anonymous account (**${result.nickname}**) has been sent to the bot owner for approval.\n\n` +
            `• **Status:** Pending Owner Review\n\n` +
            `You will receive a direct message once the bot owner has accepted or declined your request.`
          )
        ]
      });
    }
  }
};

