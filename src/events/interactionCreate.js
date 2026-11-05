'use strict';

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const messageService = require('../services/messageService');
const routingService = require('../services/routingService');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed } = require('../utils/helpers');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // 1. Handle Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`[Interaction] Unknown command: ${interaction.commandName}`);
          return;
        }

        await command.execute(interaction);
        return;
      }

      // 2. Handle String Select Menus
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'anon_select_server') {
          const selectedGuildId = interaction.values[0];
          const guild = interaction.client.guilds.cache.get(selectedGuildId);
          const guildName = guild ? guild.name : 'Selected Server';

          // Open the composition modal
          const modal = new ModalBuilder()
            .setCustomId(`anon_modal_${selectedGuildId}`)
            .setTitle(`Send to ${guildName.slice(0, 30)}`);

          const messageInput = new TextInputBuilder()
            .setCustomId('anon_message_input')
            .setLabel('Your Anonymous Message')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Type your message here... (@everyone and user pings are blocked)')
            .setMaxLength(2000)
            .setRequired(true);

          const actionRow = new ActionRowBuilder().addComponents(messageInput);
          modal.addComponents(actionRow);

          await interaction.showModal(modal);
          return;
        }

        if (interaction.customId === 'select_server_info') {
          const selectedGuildId = interaction.values[0];
          const config = routingService.getGuildConfig(selectedGuildId);
          const guild = interaction.client.guilds.cache.get(selectedGuildId);

          const embed = createInfoEmbed(
            `Server: ${guild ? guild.name : selectedGuildId}`,
            `• **Server ID:** \`${selectedGuildId}\`\n` +
            `• **Channel:** ${config ? `<#${config.channel_id}>` : 'Not configured'}\n` +
            `• **Status:** ${config && config.enabled ? '🟢 Accepting anonymous messages' : '🔴 Disabled'}\n\n` +
            `To send a message here, use \`/send\` and pick this server.`
          );

          if (guild && guild.iconURL()) {
            embed.setThumbnail(guild.iconURL());
          }

          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
          return;
        }
      }

      // 3. Handle Modal Submissions
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('anon_modal_')) {
          const targetGuildId = interaction.customId.replace('anon_modal_', '');
          const content = interaction.fields.getTextInputValue('anon_message_input');

          await interaction.deferReply({ ephemeral: true });

          const result = await messageService.sendMessage({
            client: interaction.client,
            discordUserId: interaction.user.id,
            targetGuildId,
            content,
            rawAttachments: []
          });

          if (!result.success) {
            return interaction.editReply({
              embeds: [createErrorEmbed('Delivery Failed', result.error)]
            });
          }

          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                'Message Sent Anonymously',
                `Your message has been posted to **${result.guildName}** in **#${result.channelName}**!\n\n` +
                `• **Displayed As:** ${result.nickname}\n` +
                `• **Message Reference:** \`${result.messageUuid}\``
              )
            ]
          });
        }
      }
    } catch (err) {
      console.error('[Interaction Error]', err);

      const errorMessage = {
        embeds: [createErrorEmbed('Error', 'An unexpected error occurred while processing your request.')],
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorMessage).catch(() => null);
      } else {
        await interaction.reply(errorMessage).catch(() => null);
      }
    }
  }
};

