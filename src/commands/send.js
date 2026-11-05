'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const routingService = require('../services/routingService');
const registrationService = require('../services/registrationService');
const messageService = require('../services/messageService');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send an anonymous message to a participating server')
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('Optional server ID (leave empty to pick from a list)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Your message text (leave empty to open a modal editor)')
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('attachment1').setDescription('First file attachment (PNG, JPG, WEBP, GIF, PDF, TXT)')
    )
    .addAttachmentOption((option) =>
      option.setName('attachment2').setDescription('Second file attachment')
    )
    .addAttachmentOption((option) =>
      option.setName('attachment3').setDescription('Third file attachment')
    )
    .addAttachmentOption((option) =>
      option.setName('attachment4').setDescription('Fourth file attachment')
    )
    .addAttachmentOption((option) =>
      option.setName('attachment5').setDescription('Fifth file attachment')
    ),

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
        ephemeral: true
      });
    }

    if (user.is_banned) {
      return interaction.reply({
        embeds: [createErrorEmbed('Account Suspended', 'Your account has been banned from sending anonymous messages.')],
        ephemeral: true
      });
    }

    const availableServers = routingService.getAvailableGuilds(interaction.client);
    if (availableServers.length === 0) {
      return interaction.reply({
        embeds: [createErrorEmbed('No Servers Available', 'There are currently no active servers configured for anonymous chat.')],
        ephemeral: true
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

    // If server is specified directly
    let targetGuildId = serverOption;
    if (targetGuildId) {
      const matched = availableServers.find((s) => s.id === targetGuildId);
      if (!matched) {
        return interaction.reply({
          embeds: [createErrorEmbed('Server Not Found', `Server "${targetGuildId}" is not configured or bot is not in it. Use \`/servers\` to view available options.`)],
          ephemeral: true
        });
      }

      // If message or attachments were provided, dispatch right now
      if (messageContent || rawAttachments.length > 0) {
        await interaction.deferReply({ ephemeral: true });
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

      // No message provided, show modal for this server
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

    // Server was not specified, show select menu
    const options = availableServers.slice(0, 25).map((s) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.name.slice(0, 100))
        .setValue(s.id)
        .setDescription(`Channel ID: ${s.channelId}`)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('anon_select_server')
      .setPlaceholder('Choose a server to send your message to...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.reply({
      content: 'Select the destination server for your anonymous message:',
      components: [row],
      ephemeral: true
    });
  }
};

