'use strict';

const userRepo = require('../database/repositories/users');
const moderationRepo = require('../database/repositories/moderation');
const constants = require('../config/constants');
const { validateNickname, validateAvatarUrl } = require('../utils/validation');

const registrationService = {
  /**
   * Registers a new user.
   */
  registerUser({ discordId, nickname, avatarUrl = null }) {
    // 1. Check if already registered
    const existingUser = userRepo.findByDiscordId(discordId);
    if (existingUser) {
      return {
        success: false,
        error: `You are already registered with the nickname: **${existingUser.nickname}**.`
      };
    }

    // 2. Validate nickname
    const nickValidation = validateNickname(nickname);
    if (!nickValidation.valid) {
      return { success: false, error: nickValidation.error };
    }

    // 3. Check if nickname is taken
    const existingNick = userRepo.findByNicknameNormalized(nickValidation.normalized);
    if (existingNick) {
      return { success: false, error: `The nickname "${nickValidation.nickname}" is already taken. Please choose another.` };
    }

    // 4. Validate avatar URL if provided
    let cleanAvatar = null;
    if (avatarUrl) {
      const avatarValidation = validateAvatarUrl(avatarUrl);
      if (!avatarValidation.valid) {
        return { success: false, error: avatarValidation.error };
      }
      cleanAvatar = avatarValidation.url;
    }

    // 5. Create user
    const user = userRepo.createUser({
      discordId,
      nickname: nickValidation.nickname,
      avatarUrl: cleanAvatar
    });

    moderationRepo.logAudit({
      actorId: discordId,
      action: 'USER_REGISTERED',
      targetId: String(user.id),
      metadata: { nickname: user.nickname }
    });

    return { success: true, user };
  },

  /**
   * Retrieves user profile by Discord ID.
   */
  getUser(discordId) {
    return userRepo.findByDiscordId(discordId);
  },

  /**
   * Changes user nickname subject to cooldown.
   */
  changeNickname({ discordId, newNickname }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'You are not registered yet. Use `/register` first.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been suspended from using AnonBot.' };
    }

    // Check cooldown
    if (user.nickname_changed_at) {
      const elapsed = Date.now() - user.nickname_changed_at;
      if (elapsed < constants.NICKNAME.COOLDOWN_MS) {
        const remainingDays = Math.ceil((constants.NICKNAME.COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
        return {
          success: false,
          error: `Nickname cooldown active. You can change your nickname again in ${remainingDays} day(s).`
        };
      }
    }

    // Validate nickname
    const validation = validateNickname(newNickname);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    if (validation.normalized === user.nickname_normalized) {
      return { success: false, error: 'Your new nickname cannot be the same as your current nickname.' };
    }

    // Check uniqueness
    const taken = userRepo.findByNicknameNormalized(validation.normalized);
    if (taken && taken.id !== user.id) {
      return { success: false, error: `The nickname "${validation.nickname}" is already taken.` };
    }

    const updatedUser = userRepo.updateNickname(user.id, validation.nickname);

    moderationRepo.logAudit({
      actorId: discordId,
      action: 'NICKNAME_CHANGED',
      targetId: String(user.id),
      metadata: { oldNickname: user.nickname, newNickname: updatedUser.nickname }
    });

    return { success: true, user: updatedUser };
  },

  /**
   * Updates user custom avatar URL.
   */
  updateAvatar({ discordId, avatarUrl }) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'You are not registered yet. Use `/register` first.' };
    }

    if (user.is_banned) {
      return { success: false, error: 'Your account has been suspended from using AnonBot.' };
    }

    let cleanUrl = null;
    if (avatarUrl) {
      const validation = validateAvatarUrl(avatarUrl);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      cleanUrl = validation.url;
    }

    const updated = userRepo.updateAvatar(user.id, cleanUrl);

    moderationRepo.logAudit({
      actorId: discordId,
      action: cleanUrl ? 'AVATAR_UPDATED' : 'AVATAR_REMOVED',
      targetId: String(user.id),
      metadata: { avatarUrl: cleanUrl }
    });

    return { success: true, user: updated };
  },

  /**
   * Deletes a user account.
   */
  deleteAccount(discordId) {
    const user = userRepo.findByDiscordId(discordId);
    if (!user) {
      return { success: false, error: 'No registered account found for your Discord user.' };
    }

    userRepo.deleteUser(user.id);

    moderationRepo.logAudit({
      actorId: discordId,
      action: 'ACCOUNT_DELETED',
      targetId: String(user.id),
      metadata: { nickname: user.nickname }
    });

    return { success: true };
  }
};

module.exports = registrationService;

