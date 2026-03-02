/**
 * Local run: polling (getUpdates). Only BOT_TOKEN needed.
<<<<<<< HEAD:app/scripts/run-bot-local.js
 * Run: BOT_TOKEN=xxx node scripts/run-bot-local.js
 * Do not run with the same token while webhook is set in production.
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (_) {}
const { createBot } = require('../bot/grammy-bot');
=======
 * Run: npx tsx scripts/run-bot-local.ts  (or npm run bot:local)
 * Do not run with the same token while webhook is set in production.
 */
import path from 'path';
import { createBot } from '../bot/grammy-bot';

try {
  const dotenv = require('dotenv');
  const cwd = process.cwd();
  dotenv.config({ path: path.join(cwd, '.env') });
  dotenv.config({ path: path.join(cwd, 'app', '.env') });
} catch {
  // dotenv optional
}
>>>>>>> upstream/main:app/scripts/run-bot-local.ts

const token = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!token) {
  console.error('Missing BOT_TOKEN (or TELEGRAM_BOT_TOKEN)');
  process.exit(1);
}

async function main() {
  const bot = createBot(token);
  await bot.api.deleteWebhook();
  await bot.start();
  console.log('Bot running locally (getUpdates). Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error(err);
<<<<<<< HEAD:app/scripts/run-bot-local.js
=======
  if (err?.error_code === 401) {
    console.error('[bot] 401 Unauthorized: check BOT_TOKEN in .env (valid token from @BotFather, no extra spaces).');
  }
>>>>>>> upstream/main:app/scripts/run-bot-local.ts
  process.exit(1);
});
