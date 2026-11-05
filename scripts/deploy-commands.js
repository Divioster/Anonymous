'use strict';

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('../src/config/config');

if (!config.discordToken || !config.clientId) {
  console.error('[Error] Both DISCORD_TOKEN and CLIENT_ID are required in .env to deploy commands.');
  process.exit(1);
}

const commands = [];

function loadCommands(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      loadCommands(fullPath);
    } else if (file.endsWith('.js')) {
      const command = require(fullPath);
      if (command.data) {
        commands.push(command.data.toJSON());
        console.log(`[Deploy Prep] /${command.data.name}`);
      }
    }
  }
}

loadCommands(path.join(__dirname, '../src/commands'));

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
  try {
    console.log(`[Deploy] Deploying ${commands.length} application (slash) commands to Discord...`);

    const guildId = process.argv[2]; // Optional guild ID for instant development deployment

    if (guildId) {
      console.log(`[Deploy] Registering commands specifically to guild ID: ${guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, guildId),
        { body: commands }
      );
      console.log('[Deploy] Successfully registered guild slash commands!');
    } else {
      console.log('[Deploy] Registering commands globally (may take a few minutes to propagate across Discord)...');
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
      );
      console.log('[Deploy] Successfully registered global slash commands!');
    }
  } catch (error) {
    console.error('[Deploy Error]', error);
    process.exit(1);
  }
})();

