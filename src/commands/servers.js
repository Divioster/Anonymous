'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const routingService = require('../services/routingService');
const { createInfoEmbed, createErrorEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servers')
    .setDescription('View all Discord servers accepting anonymous messages'),

  async execute(interaction) {
    const servers = routingService.getAvailableGuilds(interaction.client);

    if (servers.length === 0) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            'No Active Servers',
            'There are currently no Discord servers configured for anonymous messaging.'
          )
        ],
        ephemeral: true
      });
    }

    const serverListText = servers
      .map((s, idx) => `${idx + 1}. **${s.name}** (\`${s.id}\`)`)
      .join('\n');

    const embed = createInfoEmbed(
      'Participating Anonymous Servers',
      `Select a server to view or use \`/send\` to send an anonymous message:\n\n${serverListText}`
    );

    // Limit select menu to 25 items (Discord limit)
    const selectOptions = servers.slice(0, 25).map((s) => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(s.name.slice(0, 100))
        .setValue(s.id)
        .setDescription(`Server ID: ${s.id}`);

      return option;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_server_info')
      .setPlaceholder('Choose a server for details...')
      .addOptions(selectOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }
};

