# AnonBot - Multi-Server Anonymous Discord Chat Bot

A lightweight, high-performance Discord bot built with **Node.js (CommonJS)**, **Discord.js v14**, and **SQLite (better-sqlite3)** that enables pseudonymous messaging across multiple Discord servers.

---

## Key Features

- **Owner-Approved Registrations & Nicknames**: All user registrations, nickname changes, and account deletions are routed directly to the bot owner's DM with interactive **Accept / Decline** buttons. Only upon owner acceptance is the identity activated.
- **Strict Nickname Uniqueness**: Case-insensitive nickname uniqueness is enforced across both active registered users and pending requests, ensuring no two people can ever register or request the same nickname.
- **Global Anonymous Nicknames**: Users register a globally unique nickname (`/register`, `/nickname view`, `/nickname change` with a 7-day cooldown).
- **Custom Anonymous Avatars (PFPs) via Webhooks**: Users can configure their own anonymous avatar (`/avatar set <url|file>`). The bot uses native Discord Webhooks on destination channels to publish messages displaying the user's custom nickname and avatar icon without exposing their real Discord username, avatar, or ID.
- **Privacy by Design**: All user commands (`/register`, `/nickname`, `/avatar`, `/send`, `/servers`, `/account`) are responded to with **ephemeral messages** so no one else in a server or channel can see who owns what nickname.
- **Bot-Owner Only Management**: Server configuration (`/setup`, `/settings`, `/disable`) and channel audit (`/channel-users`) are restricted exclusively to the bot owner (`GLOBAL_ADMIN_IDS`).
- **Rich Message Dispatch**:
  - Modal-based composition via `/send` or instant dispatch with arguments.
  - Full support for up to 5 file attachments (PNG, JPG, WEBP, GIF, PDF, TXT) up to 8 MB each.
  - Binary magic byte validation preventing spoofed executable files.
  - Automatic mention blocking (`allowedMentions: { parse: [] }`) preventing `@everyone`, `@here`, role, or user pings.
- **Robust SQLite Architecture**:
  - SQLite with WAL (Write-Ahead Logging) and foreign keys enabled.
  - Prepared statements for zero SQL injection risk.
  - Rate limiting (1 msg / 5s, 10 / min, 100 / day).
  - Online hot backups via `scripts/backup-db.js`.
- **Global Owner Moderation**:
  - `/user ban`, `/user unban`, `/user info`
  - `/message lookup` (reveals original sender Discord ID only to bot owner)
  - `/message delete` (removes message from channel and database)
  - `/stats` (realtime system metrics)
  - `/channel-users` (lists registered users active in a target channel)

---

## Project Structure

```
.
├── .env.example              # Environment variables template
├── .gitignore
├── anonbot.service           # systemd service unit file for Ubuntu VPS
├── package.json
├── README.md
├── scripts/
│   ├── deploy-commands.js    # Registers slash commands to Discord
│   ├── backup-db.js          # SQLite hot backup script
│   └── backup-db.sh          # Executable backup runner
└── src/
    ├── index.js              # Application entry point
    ├── config/
    │   ├── config.js         # Environment loader & validator
    │   └── constants.js      # System limits & defaults
    ├── database/
    │   ├── database.js       # SQLite connection & schema initialization
    │   ├── schema.sql        # Database schema & indexes
    │   └── repositories/
    │       ├── users.js
    │       ├── guilds.js
    │       ├── messages.js
    │       └── moderation.js
    ├── utils/
    │   ├── validation.js     # Nickname, avatar & content validation
    │   ├── permissions.js    # Owner & Discord channel permission checks
    │   └── helpers.js        # Embed builders & helpers
    ├── services/
    │   ├── attachmentService.js # File validation & signature checking
    │   ├── registrationService.js # User & nickname management
    │   ├── routingService.js # Guild & webhook setup
    │   ├── messageService.js # Message dispatch & webhook execution
    │   └── moderationService.js # Moderation & audit
    ├── commands/
    │   ├── register.js       # /register
    │   ├── nickname.js       # /nickname view | change
    │   ├── avatar.js         # /avatar view | set | remove
    │   ├── servers.js        # /servers
    │   ├── send.js           # /send
    │   ├── setup.js          # /setup (Owner only)
    │   ├── settings.js       # /settings (Owner only)
    │   ├── disable.js        # /disable (Owner only)
    │   ├── account.js        # /account delete
    │   └── admin/
    │       ├── user.js       # /user ban | unban | info (Owner only)
    │       ├── message.js    # /message lookup | delete (Owner only)
    │       ├── stats.js      # /stats (Owner only)
    │       └── channelUsers.js # /channel-users (Owner only)
    └── events/
        ├── ready.js          # Ready event & rate limit cleanup task
        └── interactionCreate.js # Command, select menu & modal router
```

---

## 1. Discord Developer Portal Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name (e.g. `AnonBot`).
3. Under **General Information**, copy the **Application ID** (this is your `CLIENT_ID`).
4. Navigate to the **Bot** tab:
   - Click **Reset Token** and copy the token (this is your `DISCORD_TOKEN`).
   - Under **Privileged Gateway Intents**, enable:
     - `Server Members Intent` (Optional, recommended)
     - `Message Content Intent` (Optional for slash commands, recommended)
5. Generate an OAuth2 Invite Link:
   - Go to **OAuth2 > URL Generator**.
   - Under **Scopes**, select: `bot`, `applications.commands`.
   - Under **Bot Permissions**, select:
     - `View Channels`
     - `Send Messages`
     - `Manage Webhooks` *(Required for custom nickname + PFP relay)*
     - `Embed Links`
     - `Attach Files`
     - `Read Message History`
   - Copy the generated URL and invite the bot to your Discord servers.

---

## 2. Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_id_here
GLOBAL_ADMIN_IDS=your_discord_user_id_here
DATABASE_PATH=./data/bot.sqlite
DEFAULT_AVATAR_URL=https://cdn.discordapp.com/embed/avatars/0.png
```

> **Note**: `GLOBAL_ADMIN_IDS` is a comma-separated list of Discord user IDs who have permission to run `/setup`, `/settings`, `/disable`, `/channel-users`, and moderation commands.

---

## 3. Register Slash Commands

Deploy commands globally:

```bash
npm run deploy-commands
```

*(Optional)* Deploy instantly to a specific guild for fast testing:

```bash
node scripts/deploy-commands.js YOUR_GUILD_ID
```

---

## 4. Running the Bot Locally

```bash
# Start the bot
npm start

# Or pull latest changes from main and start
npm run execute
```

---

## 5. Deployment on Ubuntu VPS (systemd)

### Step 1: Install Node.js on the VPS
```bash
sudo apt update && sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 2: Clone or Transfer the Codebase
```bash
sudo mkdir -p /opt/anonbot
sudo chown -R $USER:$USER /opt/anonbot
cd /opt/anonbot

# Copy or git clone your files here
npm install --omit=dev
```

### Step 3: Configure Environment & Register Commands
```bash
cp .env.example .env
nano .env # Enter your token, client ID, and admin ID
npm run deploy-commands
```

### Step 4: Install systemd Service for Auto-Start & Crash Recovery
Edit `/opt/anonbot/anonbot.service` to verify `User=` matches your VPS username (e.g., `ubuntu` or `root`).

```bash
sudo cp /opt/anonbot/anonbot.service /etc/systemd/system/anonbot.service
sudo systemctl daemon-reload
sudo systemctl enable anonbot
sudo systemctl start anonbot
```

Check status and live logs:
```bash
sudo systemctl status anonbot
sudo journalctl -u anonbot -f
```

---

## 6. SQLite Hot Backups

You can back up the SQLite database at any time without stopping the bot:

```bash
npm run backup
```

Backups are saved to `./backups/anonbot-backup-TIMESTAMP.sqlite`.

To schedule daily automatic backups with `cron`:
```bash
crontab -e
```
Add the following line (runs every day at 3:00 AM):
```cron
0 3 * * * cd /opt/anonbot && /usr/bin/npm run backup >> /var/log/anonbot-backup.log 2>&1
```

---

## 7. Command Reference

### Public User Commands (Always Ephemeral)
| Command | Description |
| :--- | :--- |
| `/register <nickname> [avatar_url]` | Register a global anonymous nickname and optional avatar URL |
| `/nickname view` | View your current nickname, registration date, and avatar |
| `/nickname change <new_nickname>` | Change nickname (subject to a 7-day cooldown) |
| `/avatar view` | Preview your current anonymous profile picture |
| `/avatar set [url] [file]` | Set a custom profile picture using an image URL or direct upload |
| `/avatar remove` | Reset your avatar to the default silhouette |
| `/servers` | View all servers currently accepting anonymous messages |
| `/send [server] [message] [attachments]` | Open modal composition or send an anonymous message with up to 5 attachments |
| `/account delete` | Permanently delete your anonymous account |

### Bot Owner Commands (Restricted to `GLOBAL_ADMIN_IDS`)
| Command | Description |
| :--- | :--- |
| `/setup <channel> [guild_id]` | Configure destination channel for a server and create relay webhook |
| `/settings [guild_id]` | Inspect current channel configuration, webhook status, and permissions |
| `/disable [guild_id]` | Disable anonymous messaging for a server |
| `/channel-users [guild_id]` | View all registered users and nicknames who have posted in a channel |
| `/user ban <target> [reason]` | Globally ban a user by Discord ID, nickname, or internal ID |
| `/user unban <target>` | Unban a user |
| `/user info <target>` | View confidential user profile, Discord ID, registration info, and history |
| `/message lookup <identifier>` | Reveal sender Discord ID and audit trail for a message UUID or Discord ID |
| `/message delete <identifier>` | Delete message from Discord channel and update audit log |
| `/stats` | View bot statistics (users, servers, messages, uptime) |

