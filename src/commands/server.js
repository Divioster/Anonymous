'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const roleService = require('../services/roleService');
const routingService = require('../services/routingService');
const { isGlobalAdmin } = require('../utils/permissions');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Manage server settings and role assignments (Bot Owner only)')
    .setDefaultMemberPermissions(0)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('update-roles')
        .setDescription('Assign the "Anonymous" role to all registered users and remove it from unregistered ones')
        .addStringOption((option) =>
          option
            .setName('server')
            .setDescription('Target server (defaults to the current server)')
            .setAutocomplete(true)
            .setRequired(false)
        )
    ),

  async autocomplete(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.respond([]);
    }

    try {
      const focusedValue = (interaction.options.getFocused() || '').toLowerCase();
      const guilds = interaction.client.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name
      }));

      const filtered = guilds.filter((g) =>
        g.name.toLowerCase().includes(focusedValue) || g.id.includes(focusedValue)
      );

      await interaction.respond(
        filtered.slice(0, 25).map((g) => ({
          name: `${g.name.slice(0, 85)} (${g.id.slice(-4)})`,
          value: g.id
        }))
      );
    } catch (err) {
      console.error('[Autocomplete Error in /server]', err);
    }
  },

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only the authorized bot owner can manage server roles.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'update-roles') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const serverOption = interaction.options.getString('server');
      let targetGuild = interaction.guild;

      if (serverOption) {
        const guildId = serverOption.trim();
        targetGuild = interaction.client.guilds.cache.get(guildId) || (await interaction.client.guilds.fetch(guildId).catch(() => null));
      }

      if (!targetGuild) {
        return interaction.editReply({
          embeds: [
            createErrorEmbed(
              'Server Required',
              'Please run this command inside a server or select a valid server from the autocomplete list.'
            )
          ]
        });
      }

      const result = await roleService.updateServerRoles(targetGuild);

      if (!result.success) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Role Update Failed', result.error)]
        });
      }

      let description =
        `Successfully synchronized the **@${result.role.name}** role for **${targetGuild.name}**.\n\n` +
        `• **Role:** <@&${result.role.id}>\n` +
        `• **Role Setup:** ${result.roleCreated ? 'Created new **Anonymous** role' : 'Found existing **Anonymous** role'}\n` +
        `• **Roles Added:** **${result.addedCount}** registered user${result.addedCount === 1 ? '' : 's'}\n` +
        `• **Roles Removed:** **${result.removedCount}** unregistered or deleted user${result.removedCount === 1 ? '' : 's'}\n` +
        `• **Total Users with Role:** **${result.totalWithRole}**`;

      if (result.errors && result.errors.length > 0) {
        description += `\n\n⚠️ **Warnings (${result.errors.length}):**\n` + result.errors.slice(0, 5).join('\n');
      }

      const embed = createSuccessEmbed('Anonymous Roles Updated', description);

      return interaction.editReply({
        embeds: [embed]
      });
    }
  }
};

