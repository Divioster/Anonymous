'use strict';

const { PermissionFlagsBits } = require('discord.js');
const config = require('../config/config');

function isGlobalAdmin(userId) {
  if (!userId) return false;
  return config.globalAdminIds.includes(String(userId));
}

function checkBotChannelPermissions(channel, clientUser) {
  if (!channel || !channel.guild) {
    return { hasPermissions: false, missing: ['Guild channel not found'] };
  }

  const permissions = channel.permissionsFor(clientUser);
  if (!permissions) {
    return { hasPermissions: false, missing: ['Cannot determine bot permissions'] };
  }

  const required = [
    { bit: PermissionFlagsBits.ViewChannel, name: 'ViewChannel' },
    { bit: PermissionFlagsBits.SendMessages, name: 'SendMessages' },
    { bit: PermissionFlagsBits.EmbedLinks, name: 'EmbedLinks' },
    { bit: PermissionFlagsBits.AttachFiles, name: 'AttachFiles' },
    { bit: PermissionFlagsBits.ManageWebhooks, name: 'ManageWebhooks' }
  ];

  const missing = [];
  for (const perm of required) {
    if (!permissions.has(perm.bit)) {
      missing.push(perm.name);
    }
  }

  return {
    hasPermissions: missing.length === 0,
    missing
  };
}

module.exports = {
  isGlobalAdmin,
  checkBotChannelPermissions
};

