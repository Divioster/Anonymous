'use strict';

const { PermissionFlagsBits } = require('discord.js');
const userRepo = require('../database/repositories/users');

const ROLE_NAME = 'Anon';

const roleService = {
  /**
   * Ensures the unmanaged "Anon" role exists in the given guild and bot has permission to manage it.
   */
  async ensureAnonRole(guild) {
    if (!guild) {
      return { success: false, error: 'Guild not found.' };
    }

    const botMember = guild.members.me || (await guild.members.fetch(guild.client.user.id).catch(() => null));
    if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return {
        success: false,
        error: `AnonBot lacks the **Manage Roles** permission in **${guild.name}**.`
      };
    }

    // Always fetch unmanaged roles to avoid selecting the bot's own integration role
    let role = guild.roles.cache.find((r) => r.name.toLowerCase() === ROLE_NAME.toLowerCase() && !r.managed);
    if (!role) {
      const fetchedRoles = await guild.roles.fetch().catch(() => null);
      if (fetchedRoles) {
        role = fetchedRoles.find((r) => r.name.toLowerCase() === ROLE_NAME.toLowerCase() && !r.managed);
      }
    }

    let created = false;
    if (!role) {
      try {
        role = await guild.roles.create({
          name: ROLE_NAME,
          color: 0x5865F2,
          mentionable: false,
          reason: 'Anon chat role created by AnonBot for registered users'
        });
        created = true;
      } catch (err) {
        return {
          success: false,
          error: `Failed to create **${ROLE_NAME}** role: ${err.message}`
        };
      }
    }

    if (botMember.roles.highest.position <= role.position) {
      return {
        success: false,
        error: `The **${ROLE_NAME}** role is positioned higher than or equal to AnonBot's highest role. Please drag AnonBot's role above **${ROLE_NAME}** in Server Settings > Roles.`
      };
    }

    return { success: true, role, created };
  },

  // Alias for backward compatibility
  async ensureAnonymousRole(guild) {
    return this.ensureAnonRole(guild);
  },

  /**
   * Updates and synchronizes the "Anon" role for members in a server without gateway chunking delays.
   * - Gives the role to all registered (and non-banned) users.
   * - Removes the role from users who are not registered or have been deleted/banned.
   */
  async updateServerRoles(guild) {
    const roleResult = await this.ensureAnonRole(guild);
    if (!roleResult.success) {
      return roleResult;
    }

    const role = roleResult.role;
    const allUsers = userRepo.getAllUsers();
    const registeredIds = new Set(allUsers.filter((u) => !u.is_banned).map((u) => u.discord_id));

    let addedCount = 0;
    let removedCount = 0;
    const errors = [];

    // 1. Process all registered users via direct REST member fetches (10 concurrently)
    const batchSize = 10;
    for (let i = 0; i < allUsers.length; i += batchSize) {
      const batch = allUsers.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (user) => {
          try {
            // Direct REST member fetch by single ID never hangs on gateway chunking
            const member = await guild.members.fetch(user.discord_id).catch(() => null);
            if (!member) return;

            if (user.is_banned) {
              if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role, 'User is banned from AnonBot').catch(() => null);
                removedCount++;
              }
              return;
            }

            if (!member.roles.cache.has(role.id)) {
              await member.roles.add(role, 'User is registered in AnonBot').catch(() => null);
              addedCount++;
            }
          } catch (err) {
            errors.push(`Error updating <@${user.discord_id}>: ${err.message}`);
          }
        })
      );
    }

    // 2. Remove role from any cached member who currently has the role but is NOT registered
    const membersWithRole = role.members || guild.members.cache.filter((m) => m.roles.cache.has(role.id));
    for (const member of membersWithRole.values()) {
      if (!registeredIds.has(member.id)) {
        try {
          await member.roles.remove(role, 'User is not registered or was deleted from AnonBot').catch(() => null);
          removedCount++;
        } catch (err) {
          errors.push(`Failed to remove role from <@${member.id}>: ${err.message}`);
        }
      }
    }

    return {
      success: true,
      guild,
      role,
      roleCreated: roleResult.created,
      addedCount,
      removedCount,
      totalWithRole: role.members.size,
      errors
    };
  },

  /**
   * Syncs a single user across all mutual guilds where AnonBot is present and the "Anon" role exists.
   */
  async syncUserAcrossGuilds(client, discordId, isRegistered) {
    if (!client || !discordId) return;

    for (const guild of client.guilds.cache.values()) {
      try {
        const role = guild.roles.cache.find((r) => r.name.toLowerCase() === ROLE_NAME.toLowerCase() && !r.managed);
        if (!role) continue;

        const botMember = guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) continue;
        if (botMember.roles.highest.position <= role.position) continue;

        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) continue;

        if (isRegistered) {
          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role, 'User registered in AnonBot').catch(() => null);
          }
        } else {
          if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role, 'User unregistered or deleted from AnonBot').catch(() => null);
          }
        }
      } catch (err) {
        console.warn(`[Role Sync Error] Guild ${guild.id}, user ${discordId}:`, err.message);
      }
    }
  }
};

module.exports = roleService;
