'use strict';

// ==========================================
// Global Process Exception & Rejection Handlers
// (Registered at the very top so no error crashes the bot)
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Anti-Crash] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error(`[Anti-Crash] Caught Uncaught Exception: ${err.message}`, {
    origin,
    stack: err.stack
  });
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
  console.error(`[Anti-Crash Monitor] Exception origin: ${origin}, error: ${err.message}`);
});

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const config = require('./config/config');
const { getDatabase, closeDatabase } = require('./database/database');

// Ensure database is initialized at startup
try {
  getDatabase();
  console.log('[Database] SQLite database connected and schema initialized.');
} catch (err) {
  console.error('[Database Startup Error] Failed to initialize SQLite database:', err);
}

// Create Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Client-level error handlers
client.on('error', (error) => {
  console.error('[Discord Client Error]', error);
});

client.on('shardError', (error, shardId) => {
  console.error(`[Discord Shard Error] Shard ${shardId}:`, error);
});

client.on('warn', (warning) => {
  console.warn('[Discord Warning]', warning);
});

client.commands = new Collection();

// Command loader helper
function loadCommands(directory) {
  try {
    const files = fs.readdirSync(directory);
    for (const file of files) {
      const fullPath = path.join(directory, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        loadCommands(fullPath);
      } else if (file.endsWith('.js')) {
        try {
          const command = require(fullPath);
          if (command.data && command.data.name) {
            client.commands.set(command.data.name, command);
            console.log(`[Command Loaded] /${command.data.name}`);
          }
        } catch (err) {
          console.error(`[Command Load Error] Could not load ${file}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error(`[Command Directory Read Error] ${directory}:`, err.message);
  }
}

// Load commands and events
const commandsDir = path.join(__dirname, 'commands');
loadCommands(commandsDir);

try {
  const eventsDir = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsDir).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsDir, file));
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      console.log(`[Event Loaded] ${event.name}`);
    } catch (err) {
      console.error(`[Event Load Error] Could not load ${file}:`, err.message);
    }
  }
} catch (err) {
  console.error('[Events Directory Read Error]:', err.message);
}

// Graceful shutdown handling
function shutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Closing AnonBot cleanly...`);
  try {
    client.destroy();
    closeDatabase();
    console.log('[Shutdown] Cleanup complete. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('[Shutdown Error]', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Validate token before login
if (!config.discordToken) {
  console.error('[Startup Warning] DISCORD_TOKEN is missing in environment or .env file.');
} else {
  // Login with resilient retry logic
  function startBot() {
    client.login(config.discordToken).catch((err) => {
      console.error('[Discord Login Error] Failed to login:', err.message);
      console.log('[Anti-Crash] Retrying login in 10 seconds...');
      setTimeout(startBot, 10000);
    });
  }

  startBot();
}

