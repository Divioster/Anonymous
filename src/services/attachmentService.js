'use strict';

const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const constants = require('../config/constants');
const { sanitizeFilename } = require('../utils/helpers');

const attachmentService = {
  /**
   * Validates a collection or array of Discord attachments.
   * @param {Array|Collection} rawAttachments
   */
  async validateAttachments(rawAttachments) {
    const list = Array.isArray(rawAttachments) ? rawAttachments : Array.from(rawAttachments.values());

    if (list.length > constants.ATTACHMENTS.MAX_COUNT) {
      return {
        valid: false,
        error: `A maximum of ${constants.ATTACHMENTS.MAX_COUNT} attachments are allowed per message.`
      };
    }

    const validated = [];

    for (const att of list) {
      // 1. Check file size
      if (att.size > constants.ATTACHMENTS.MAX_SIZE_BYTES) {
        return {
          valid: false,
          error: `Attachment "${att.name}" exceeds the maximum allowed size of 8 MB.`
        };
      }

      // 2. Check extension
      const ext = path.extname(att.name || '').replace('.', '').toLowerCase();
      if (!constants.ATTACHMENTS.ALLOWED_EXTENSIONS.includes(ext)) {
        return {
          valid: false,
          error: `File type ".${ext}" is not supported. Allowed formats: ${constants.ATTACHMENTS.ALLOWED_EXTENSIONS.join(', ')}.`
        };
      }

      // 3. Check content type if provided
      if (att.contentType && !constants.ATTACHMENTS.ALLOWED_MIME_TYPES.includes(att.contentType.toLowerCase())) {
        return {
          valid: false,
          error: `MIME type "${att.contentType}" is not supported.`
        };
      }

      // 4. Verify file signatures (magic bytes) for image/pdf attachments
      try {
        const signatureCheck = await this.verifyMagicBytes(att.url, ext);
        if (!signatureCheck.valid) {
          return {
            valid: false,
            error: `File "${att.name}" failed binary signature verification: ${signatureCheck.error}`
          };
        }
      } catch (err) {
        // If fetch fails or network blocked, log warning and allow fallback if extension is verified
        console.warn(`[Attachment Signature Check] Could not verify magic bytes: ${err.message}`);
      }

      validated.push({
        originalFilename: sanitizeFilename(att.name),
        mimeType: att.contentType || `application/${ext}`,
        fileSize: att.size,
        discordAttachmentId: att.id,
        url: att.url,
        proxyURL: att.proxyURL || att.url
      });
    }

    return { valid: true, attachments: validated };
  },

  /**
   * Fetches the first 16 bytes of a Discord attachment to verify its magic bytes.
   */
  async verifyMagicBytes(url, extension) {
    if (extension === 'txt') {
      return { valid: true };
    }

    try {
      const response = await fetch(url, {
        headers: { Range: 'bytes=0-15' }
      });
      if (!response.ok) {
        return { valid: true }; // Could not range fetch, trust extension
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 4) {
        return { valid: false, error: 'File is too small or truncated.' };
      }

      // Check PNG: 89 50 4E 47
      if (extension === 'png') {
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
        return isPng ? { valid: true } : { valid: false, error: 'File header does not match PNG format.' };
      }

      // Check JPEG: FF D8 FF
      if (extension === 'jpg' || extension === 'jpeg') {
        const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
        return isJpg ? { valid: true } : { valid: false, error: 'File header does not match JPEG format.' };
      }

      // Check GIF: 47 49 46 38
      if (extension === 'gif') {
        const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
        return isGif ? { valid: true } : { valid: false, error: 'File header does not match GIF format.' };
      }

      // Check PDF: 25 50 44 46 (%PDF)
      if (extension === 'pdf') {
        const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
        return isPdf ? { valid: true } : { valid: false, error: 'File header does not match PDF format.' };
      }

      // Check WEBP: RIFF .... WEBP
      if (extension === 'webp') {
        const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        return isRiff ? { valid: true } : { valid: false, error: 'File header does not match WEBP format.' };
      }

      return { valid: true };
    } catch {
      return { valid: true };
    }
  },

  /**
   * Prepares AttachmentBuilder array for sending via webhook or channel.
   */
  createDiscordFiles(validatedAttachments) {
    return validatedAttachments.map((att) => {
      return new AttachmentBuilder(att.url, {
        name: att.originalFilename
      });
    });
  }
};

module.exports = attachmentService;

