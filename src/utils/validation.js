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
 * Validates an image URL for avatar (JPG or PNG only).
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

    const pathname = parsed.pathname.toLowerCase();
    const hasJpgOrPngExt = /\.(jpe?g|png)$/i.test(pathname);
    const formatParam = parsed.searchParams.get('format')?.toLowerCase();
    const hasJpgOrPngParam = formatParam === 'png' || formatParam === 'jpg' || formatParam === 'jpeg';

    if (!hasJpgOrPngExt && !hasJpgOrPngParam) {
      return {
        valid: false,
        error: 'Avatar image must be a JPG or PNG file (.jpg, .jpeg, or .png).'
      };
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

