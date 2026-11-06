'use strict';

const registrationService = require('../services/registrationService');
const attachmentService = require('../services/attachmentService');
const requestRepo = require('../database/repositories/requests');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed } = require('../utils/helpers');

module.exports = {
  name: 'messageCreate',
  once: false,

  async execute(message) {
    // Ignore all bot messages
    if (message.author.bot) return;

    // Only handle Direct Messages
    if (message.guild) return;

    const discordId = message.author.id;
    const user = registrationService.getUser(discordId);

    // If an attachment was sent directly in DMs
    if (message.attachments.size > 0) {
      if (!user) {
        return message.reply({
          embeds: [
            createErrorEmbed(
              'Not Registered',
              'You must register an anonymous nickname first using `/register` in any server where AnonBot is present before updating your avatar.'
            )
          ]
        }).catch(() => null);
      }

      if (user.is_banned) {
        return message.reply({
          embeds: [createErrorEmbed('Account Suspended', 'Your AnonBot account is currently suspended.')]
        }).catch(() => null);
      }

      const pendingReq = requestRepo.findPendingByDiscordId(discordId, 'AVATAR_CHANGE');
      if (pendingReq) {
        return message.reply({
          embeds: [
            createErrorEmbed(
              'Request Pending',
              'You already have an avatar update request awaiting bot owner review.'
            )
          ]
        }).catch(() => null);
      }

      const attachment = message.attachments.first();

      // Validate that attachment is strictly JPG or PNG
      const fileValidation = await attachmentService.validateAvatarFile(attachment);
      if (!fileValidation.valid) {
        return message.reply({
          embeds: [
            createErrorEmbed(
              'Invalid Image File',
              `${fileValidation.error}\n\nOnly **JPG** and **PNG** images are supported for profile pictures.`
            )
          ]
        }).catch(() => null);
      }

      const result = await registrationService.requestAvatarChange({
        client: message.client,
        discordId,
        attachmentFile: attachment,
        isRemove: false
      });

      if (!result.success) {
        return message.reply({
          embeds: [createErrorEmbed('Failed to Submit Request', result.error)]
        }).catch(() => null);
      }

      const embed = createSuccessEmbed(
        'Avatar Update Request Submitted',
        `Your direct image attachment for **${user.nickname}** has been sent to the bot owner for approval!\n\n` +
        `• **Preview:** [New Avatar Link](${result.newAvatar})\n` +
        `• **Format:** JPG / PNG\n` +
        `• **Status:** Pending Owner Review\n\n` +
        `You will receive a direct message once the bot owner has accepted or declined your request.`
      ).setThumbnail(result.newAvatar);

      return message.reply({ embeds: [embed] }).catch(() => null);
    }

    // Direct text message helper response
    const statusText = user
      ? `You are registered as **${user.nickname}**.`
      : 'You are not yet registered. Use `/register` in any server where AnonBot is installed.';

    const helpEmbed = createInfoEmbed(
      'AnonBot Direct Messages',
      `${statusText}\n\n` +
      `• **Set Avatar Directly:** Drag & drop or attach a **JPG** or **PNG** image right here in this DM to submit an avatar update request.\n` +
      `• **Slash Commands:** You can also use \`/avatar set\` (with a direct image file or URL), \`/register\`, \`/nickname\`, and \`/send\` in your server channels.`
    );

    return message.reply({ embeds: [helpEmbed] }).catch(() => null);
  }
};

