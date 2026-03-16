/**
 * Local run: polling (getUpdates). Only BOT_TOKEN needed.
 * Run: npx tsx scripts/run-bot-local.ts  (or npm run bot:local)
 * Do not run with the same token while webhook is set in production.
 */
import { createBot } from '../bot/grammy';
import { loadEnv } from './load-env';

loadEnv();

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
  if (err?.error_code === 401) {
    console.error('[bot] 401 Unauthorized: check BOT_TOKEN in .env (valid token from @BotFather, no extra spaces).');
  }
  process.exit(1);
});
