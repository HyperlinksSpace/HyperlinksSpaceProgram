/**
 * Shared Grammy bot.
 * Used by api/bot/webhook.ts (Vercel webhook) and scripts/run-bot-local.ts (polling).
 */
import { Bot, type Context } from 'grammy';
import {
  normalizeUsername,
  upsertUserFromBot,
} from '../shared/users.js';

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  async function handleUserUpsert(ctx: Context): Promise<void> {
    try {
      const from = ctx.from;
      if (!from) return;

      const telegramUsername = normalizeUsername(from.username);
      if (!telegramUsername) return;

      const locale =
        typeof from.language_code === 'string' ? from.language_code : null;

      await upsertUserFromBot({ telegramUsername, locale });
    } catch (err) {
      console.error('[bot] upsert user failed', err);
    }
  }

  bot.command('start', async (ctx: Context) => {
    await handleUserUpsert(ctx);
    await ctx.reply('Hello');
  });

  bot.on('message:text', async (ctx: Context) => {
    await handleUserUpsert(ctx);
    await ctx.reply('Hello');
  });

  bot.on('message', async (ctx: Context) => {
    await handleUserUpsert(ctx);
    await ctx.reply('Hello');
  });

  bot.catch((err) => {
    console.error('[bot]', err);
  });

  return bot;
}

