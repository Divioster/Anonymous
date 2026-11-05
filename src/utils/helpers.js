'use strict';

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

function generateUuid() {
  return crypto.randomUUID();
}

function sanitizeFilename(filename) {
  if (!filename) return 'attachment';
  // Remove path traversal and dangerous characters
  return filename
    .replace(/^.*[\\/]/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toUTCString();
}

function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x57F287) // Discord Green
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xED4245) // Discord Red
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x5865F2) // Discord Blurple
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

module.exports = {
  generateUuid,
  sanitizeFilename,
  formatDate,
  createSuccessEmbed,
  createErrorEmbed,
  createInfoEmbed
};

