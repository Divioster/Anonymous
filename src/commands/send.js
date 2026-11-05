'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const routingService = require('../services/routingService');
const registrationService = require('../services/registrationService');
const messageService = require('../services/messageService');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/helpers');

// Temporary in-memory cache for pending message dispatches (5 minute TTL)
const pendingDispatches = new Map();

// Periodic cleanup of expired pending dispatches
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of pendingDispatches.entries()) {
    if (data.expiresAt < now) {
      pendingDispatches.delete(id);
    }
  }
}, 60 * 1000).unref();

module.exports = {
  pendingDispatches,

  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send an anonymous message to a participating server')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Your message text (leave empty to open a modal editor)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('Destination server (leave empty to choose or use current server)')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('attachment1').setDescription('First file attachment (PNG, JPG, WEBP, GIF, PDF, TXT)').setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('attachment2').setDescription('Second file attachment').setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('attachment3').setDescription('Third file attachment').setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('attachment4').setDescription('Fourth file attachment').setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('attachment5').setDescription('Fifth file attachment').setRequired(false)
    ),

  async autocomplete(interaction) {
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
      console.error('[Autocomplete Error in /send]', err);
    }
  },

  async execute(interaction) {
    // 1. Verify user is registered
    const user = registrationService.getUser(interaction.user.id);
    if (!user) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            'Registration Required',
            'You must register an anonymous nickname before sending messages.\nUse `/register <nickname>` to get started.'
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (user.is_banned) {
      return interaction.reply({
        embeds: [createErrorEmbed('Account Suspended', 'Your account has been banned from sending anonymous messages.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const availableServers = routingService.getAvailableGuilds(interaction.client);
    if (availableServers.length === 0) {
      return interaction.reply({
        embeds: [createErrorEmbed('No Servers Available', 'There are currently no active servers configured for anonymous chat.')],
        flags: MessageFlags.Ephemeral
      });
    }

    const serverOption = interaction.options.getString('server');
    const messageContent = interaction.options.getString('message');

    // Collect attachments
    const rawAttachments = [];
    for (let i = 1; i <= 5; i++) {
      const att = interaction.options.getAttachment(`attachment${i}`);
      if (att) rawAttachments.push(att);
    }

    // Determine target server:
    // If specified explicitly -> use that.
    // If not specified, but command is run in a configured participating guild -> default to current guild.
    let targetGuildId = serverOption ? serverOption.trim() : null;

    if (!targetGuildId && interaction.guildId) {
      const currentConfig = routingService.getGuildConfig(interaction.guildId);
      if (currentConfig && currentConfig.enabled) {
        targetGuildId = interaction.guildId;
      }
    }

    // Case A: Target server is determined (either via option or current guild)
    if (targetGuildId) {
      const matched = availableServers.find((s) => s.id === targetGuildId);
      if (!matched) {
        return interaction.reply({
          embeds: [createErrorEmbed('Server Not Found', `Server "${targetGuildId}" is not configured or bot is not in it. Use \`/servers\` to view available options.`)],
          flags: MessageFlags.Ephemeral
        });
      }

      // If message or attachments were provided, deliver immediately
      if (messageContent || rawAttachments.length > 0) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await messageService.sendMessage({
          client: interaction.client,
          discordUserId: interaction.user.id,
          targetGuildId,
          content: messageContent,
          rawAttachments
        });

        if (!result.success) {
          return interaction.editReply({
            embeds: [createErrorEmbed('Message Delivery Failed', result.error)]
          });
        }

        return interaction.editReply({
          embeds: [
            createSuccessEmbed(
              'Message Sent Anonymously',
              `Your message has been delivered to **${result.guildName}** in channel **#${result.channelName}**!\n\n` +
              `• **Displayed As:** ${result.nickname}\n` +
              `• **Message Reference:** \`${result.messageUuid}\``
            )
          ]
        });
      }

      // No message text or attachments provided -> show modal for this server
      const modal = new ModalBuilder()
        .setCustomId(`anon_modal_${targetGuildId}`)
        .setTitle(`Send to ${matched.name.slice(0, 30)}`);

      const textInput = new TextInputBuilder()
        .setCustomId('anon_message_input')
        .setLabel('Your Anonymous Message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type your message here... (@everyone and user pings are blocked)')
        .setMaxLength(2000)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      return interaction.showModal(modal);
    }

    // Case B: Server not specified (e.g. running in DMs without server option)
    // Save pending content/attachments if provided so they aren't lost when picking server
    let customSelectId = 'anon_select_server';
    if (messageContent || rawAttachments.length > 0) {
      customSelectId = `anon_select_server_${interaction.id}`;
      pendingDispatches.set(interaction.id, {
        userId: interaction.user.id,
        content: messageContent,
        rawAttachments,
        expiresAt: Date.now() + 5 * 60 * 1000
      });
    }

    const options = availableServers.slice(0, 25).map((s) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.name.slice(0, 100))
        .setValue(s.id)
        .setDescription('Participating anonymous chat server')
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customSelectId)
      .setPlaceholder('Choose a server to send your message to...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.reply({
      content: 'Select the destination server for your anonymous message:',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }
};
