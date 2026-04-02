/**
 * Shared Grammy bot.
 * Used by app/bot/webhook (Vercel) and scripts/run-bot-local.ts (polling).
 */
import { Bot, type Context } from 'grammy';
import {
  normalizeUsername,
  upsertUserFromBot,
} from '../database/users.js';
import { handleBotAiResponse } from './responder.js';
import { buildStartMessage } from './start.js';

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
    await ctx.reply(buildStartMessage());
  });

  bot.on('message:text', async (ctx: Context) => {
    await handleUserUpsert(ctx);
    await handleBotAiResponse(ctx);
  });

  bot.on('message:caption', async (ctx: Context) => {
    await handleUserUpsert(ctx);
    await handleBotAiResponse(ctx);
  });

  bot.catch((err) => {
    console.error('[bot]', err);
  });

  return bot;
}
