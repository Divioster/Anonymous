'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const routingService = require('../../services/routingService');
const userRepo = require('../../database/repositories/users');
const { isGlobalAdmin } = require('../../utils/permissions');
const { createInfoEmbed, createErrorEmbed, formatDate } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server-users')
    .setDescription('View all registered members in a server with their nicknames (Bot Owner only)')
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('Target server (defaults to current server)')
        .setAutocomplete(true)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.respond([]);
    }

    try {
      const focusedValue = (interaction.options.getFocused() || '').toLowerCase();
      const availableServers = routingService.getAvailableGuilds(interaction.client);

      const filtered = availableServers.filter((s) =>
        s.name.toLowerCase().includes(focusedValue) || s.id.includes(focusedValue)
      );

      await interaction.respond(
        filtered.slice(0, 25).map((s) => ({
          name: `${s.name.slice(0, 85)} (${s.id.slice(-4)})`,
          value: s.id
        }))
      );
    } catch (err) {
      console.error('[Autocomplete Error in /server-users]', err);
    }
  },

  async execute(interaction) {
    if (!isGlobalAdmin(interaction.user.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Access Denied', 'Only the authorized bot owner can view registered server users.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const serverOption = interaction.options.getString('server');
    const targetGuildId = serverOption ? serverOption.trim() : (interaction.guild ? interaction.guild.id : null);

    if (!targetGuildId) {
      return interaction.reply({
        embeds: [createErrorEmbed('Server Required', 'Please run this command inside a server or specify a server in the options.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const guild = interaction.client.guilds.cache.get(targetGuildId) ||
      await interaction.client.guilds.fetch(targetGuildId).catch(() => null);

    if (!guild) {
      return interaction.reply({
        embeds: [createErrorEmbed('Server Not Found', `Bot is not in server ID \`${targetGuildId}\`.`)],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 1. Fetch all registered users from SQLite
    const allRegisteredUsers = userRepo.getAllUsers();
    if (allRegisteredUsers.length === 0) {
      return interaction.editReply({
        embeds: [
          createInfoEmbed(
            `Registered Users in ${guild.name}`,
            'There are currently no registered anonymous users in the database.'
          )
        ]
      });
    }

    // 2. Identify which registered users are members in this specific guild
    const matchedMembers = [];

    for (const u of allRegisteredUsers) {
      try {
        const member = await guild.members.fetch(u.discord_id).catch(() => null);
        if (member) {
          matchedMembers.push({
            userRecord: u,
            member
          });
        }
      } catch (err) {
        // Continue checking other users
      }
    }

    if (matchedMembers.length === 0) {
      return interaction.editReply({
        embeds: [
          createInfoEmbed(
            `Registered Users in ${guild.name}`,
            `None of the ${allRegisteredUsers.length} globally registered users are currently in **${guild.name}**.`
          )
        ]
      });
    }

    // 3. Format lines for output
    const userLines = matchedMembers.map((item, index) => {
      const u = item.userRecord;
      const m = item.member;
      const banTag = u.is_banned ? ' 🚨 `[BANNED]`' : '';
      const avatarTag = u.avatar_url ? `[Custom Avatar](${u.avatar_url})` : 'Default';

      return `${index + 1}. **${u.nickname}** (<@${u.discord_id}> • \`${m.user.tag}\`)${banTag}\n` +
             `   • Registered: ${formatDate(u.registered_at)} | Avatar: ${avatarTag}`;
    });

    // Chunk into embeds if there are many users (Discord limit: 4096 chars per description)
    const chunks = [];
    let currentChunk = [];
    let currentLength = 0;

    for (const line of userLines) {
      if (currentLength + line.length > 3500) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [line];
        currentLength = line.length;
      } else {
        currentChunk.push(line);
        currentLength += line.length;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }

    const embeds = chunks.slice(0, 10).map((chunk, pageIndex) => {
      const embed = createInfoEmbed(
        `Registered Users: ${guild.name} (${matchedMembers.length} Total)${chunks.length > 1 ? ` • Page ${pageIndex + 1}/${chunks.length}` : ''}`,
        `All members in **${guild.name}** with a registered anonymous identity (active & inactive):\n\n${chunk}`
      );

      if (guild.iconURL()) {
        embed.setThumbnail(guild.iconURL());
      }

      return embed;
    });

    return interaction.editReply({
      embeds
    });
  }
};

