'use strict';

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const messageService = require('../services/messageService');
const routingService = require('../services/routingService');
const registrationService = require('../services/registrationService');
const sendCommand = require('../commands/send');
const { isGlobalAdmin } = require('../utils/permissions');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed } = require('../utils/helpers');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // 1. Handle Autocomplete
      if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (command && command.autocomplete) {
          await command.autocomplete(interaction);
        }
        return;
      }

      // 2. Handle Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`[Interaction] Unknown command: ${interaction.commandName}`);
          return;
        }

        await command.execute(interaction);
        return;
      }

      // 3. Handle String Select Menus
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('anon_select_server')) {
          const selectedGuildId = interaction.values[0];
          const guild = interaction.client.guilds.cache.get(selectedGuildId);
          const guildName = guild ? guild.name : 'Selected Server';

          // Check if there was pending message content/attachments from /send
          const pendingId = interaction.customId.replace('anon_select_server_', '');
          const pendingData = sendCommand.pendingDispatches ? sendCommand.pendingDispatches.get(pendingId) : null;

          if (pendingData) {
            sendCommand.pendingDispatches.delete(pendingId);

            await interaction.deferReply({ ephemeral: true });

            const result = await messageService.sendMessage({
              client: interaction.client,
              discordUserId: interaction.user.id,
              targetGuildId: selectedGuildId,
              content: pendingData.content,
              rawAttachments: pendingData.rawAttachments
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

          // No pending message was passed in /send -> Open the composition modal
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
            `• **Server Name:** ${guild ? guild.name : 'Unknown'}\n` +
            `• **Status:** ${config && config.enabled ? '🟢 Accepting anonymous messages' : '🔴 Currently not accepting messages'}\n\n` +
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

      // 4. Handle Modal Submissions
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

      // 5. Handle Buttons (Bot Owner Accept / Decline for registrations, changes, deletions)
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('approve_req_') || interaction.customId.startsWith('decline_req_')) {
          if (!isGlobalAdmin(interaction.user.id)) {
            return interaction.reply({
              embeds: [createErrorEmbed('Access Denied', 'Only the authorized bot owner can review requests.')],
              ephemeral: true
            });
          }

          const isApprove = interaction.customId.startsWith('approve_req_');
          const requestId = Number(
            interaction.customId.replace('approve_req_', '').replace('decline_req_', '')
          );

          const result = await registrationService.handleRequestDecision({
            client: interaction.client,
            requestId,
            decision: isApprove ? 'APPROVED' : 'DECLINED',
            reviewerId: interaction.user.id
          });

          if (!result.success) {
            return interaction.reply({
              embeds: [createErrorEmbed('Decision Error', result.error)],
              ephemeral: true
            });
          }

          // Update the owner's DM message to show decision and remove buttons
          const originalEmbed = interaction.message.embeds[0];
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(isApprove ? 0x57F287 : 0xED4245)
            .addFields({
              name: '📌 Decision',
              value: `${isApprove ? '✅ Approved' : '❌ Declined'} by <@${interaction.user.id}> at ${new Date().toUTCString()}`,
              inline: false
            });

          return interaction.update({
            embeds: [updatedEmbed],
            components: []
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

