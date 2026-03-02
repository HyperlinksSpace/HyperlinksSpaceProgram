/**
 * Shared Grammy bot: replies "Hello" to any message.
 * Used by bot/webhook.ts (Vercel) and scripts/run-bot-local.ts (polling).
 */
import { Bot, type Context } from 'grammy';

export function createBot(token: string): Bot {
  const bot = new Bot(token);
  bot.command('start', (ctx: Context) => ctx.reply('Hello'));
  bot.on('message:text', (ctx: Context) => ctx.reply('Hello'));
  bot.on('message', (ctx: Context) => ctx.reply('Hello'));
  bot.catch((err) => {
    console.error('[bot]', err);
  });
  return bot;
}
