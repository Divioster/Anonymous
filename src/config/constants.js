'use strict';

module.exports = {
  NICKNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 24,
    REGEX: /^[a-zA-Z0-9_-]+$/,
    COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
    RESERVED_NAMES: [
      'admin',
      'administrator',
      'mod',
      'moderator',
      'system',
      'discord',
      'everyone',
      'here',
      'anonbot',
      'anonymous',
      'owner',
      'root',
      'support',
      'staff',
      'official',
      'bot',
      'clyde',
      'webhook'
    ]
  },
  RATE_LIMITS: {
    MIN_INTERVAL_MS: 5 * 1000,          // 1 message every 5 seconds
    MAX_PER_MINUTE: 10,                 // Max 10 messages per minute
    WINDOW_MINUTE_MS: 60 * 1000,
    MAX_PER_DAY: 100,                   // Max 100 messages per day
    WINDOW_DAY_MS: 24 * 60 * 60 * 1000
  },
  ATTACHMENTS: {
    MAX_COUNT: 5,
    MAX_SIZE_BYTES: 8 * 1024 * 1024,    // 8 MB
    ALLOWED_EXTENSIONS: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'txt'],
    ALLOWED_MIME_TYPES: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain'
    ],
    MAGIC_BYTES: {
      PNG: [0x89, 0x50, 0x4E, 0x47],
      JPEG: [0xFF, 0xD8, 0xFF],
      GIF: [0x47, 0x49, 0x46, 0x38],
      PDF: [0x25, 0x50, 0x44, 0x46],
      RIFF: [0x52, 0x49, 0x46, 0x46] // WEBP starts with RIFF
    }
  },
  DEFAULT_AVATAR_URL: 'https://cdn.discordapp.com/embed/avatars/0.png',
  DELIVERY_STATUS: {
    PENDING: 'PENDING',
    DELIVERED: 'DELIVERED',
    FAILED: 'FAILED'
  }
};

