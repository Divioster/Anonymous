'use strict';

const constants = require('../config/constants');

/**
 * Validates a requested anonymous nickname.
 */
function validateNickname(rawNickname) {
  if (typeof rawNickname !== 'string') {
    return { valid: false, error: 'Nickname must be a text string.' };
  }

  // Strip zero-width and invisible characters
  const cleaned = rawNickname.replace(/[\u200B-\u200D\uFEFF\u00A0\u200E\u200F\u202A-\u202E]/g, '').trim();

  if (cleaned.length < constants.NICKNAME.MIN_LENGTH || cleaned.length > constants.NICKNAME.MAX_LENGTH) {
    return {
      valid: false,
      error: `Nickname must be between ${constants.NICKNAME.MIN_LENGTH} and ${constants.NICKNAME.MAX_LENGTH} characters.`
    };
  }

  if (!constants.NICKNAME.REGEX.test(cleaned)) {
    return {
      valid: false,
      error: 'Nickname can only contain alphanumeric characters, underscores (_), and hyphens (-).'
    };
  }

  const lower = cleaned.toLowerCase();
  if (constants.NICKNAME.RESERVED_NAMES.includes(lower)) {
    return {
      valid: false,
      error: `The nickname "${cleaned}" is reserved and cannot be registered.`
    };
  }

  return { valid: true, nickname: cleaned, normalized: lower };
}

/**
 * Validates an image URL for avatar.
 */
function validateAvatarUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Avatar URL is required.' };
  }

  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Avatar URL must use HTTP or HTTPS protocol.' };
    }

    // Check if path or hostname looks like an image or standard CDN
    const pathname = parsed.pathname.toLowerCase();
    const hasImageExt = /\.(png|jpe?g|webp|gif)$/i.test(pathname);
    const isDiscordCdn = parsed.hostname.endsWith('discordapp.com') || parsed.hostname.endsWith('discordapp.net');

    if (!hasImageExt && !isDiscordCdn) {
      return { valid: false, error: 'Avatar URL must point to a direct image file (.png, .jpg, .jpeg, .webp, .gif).' };
    }

    return { valid: true, url: trimmed };
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }
}

/**
 * Validates message content.
 */
function validateMessageContent(content, hasAttachments = false) {
  if (!content || typeof content !== 'string') {
    if (hasAttachments) {
      return { valid: true, content: '' };
    }
    return { valid: false, error: 'Message content cannot be empty unless an attachment is provided.' };
  }

  const trimmed = content.trim();
  if (!trimmed && !hasAttachments) {
    return { valid: false, error: 'Message cannot be empty or only whitespace.' };
  }

  if (trimmed.length > 2000) {
    return { valid: false, error: 'Message exceeds the 2000 character Discord limit.' };
  }

  return { valid: true, content: trimmed };
}

module.exports = {
  validateNickname,
  validateAvatarUrl,
  validateMessageContent
};

