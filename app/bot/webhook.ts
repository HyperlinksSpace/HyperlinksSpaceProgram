/**
 * Telegram webhook handler for /api/bot (serverless).
 * Flow: user sends a message in Telegram → Telegram POSTs that update here → we return 200 OK
 * immediately, then process the update in the background (waitUntil) so Telegram does not retry
 * or hide the user's message. Lives under app/bot; api/bot.ts imports this so Vercel sees one route.
 */

import { waitUntil } from '@vercel/functions';
import { createBot } from './grammy.js';

interface TelegramUpdate {
  update_id: number;
  [key: string]: unknown;
}

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
/** Single bot instance for all webhook requests; created once at module load. */
const bot = BOT_TOKEN ? createBot(BOT_TOKEN) : null;
/** Lazy init: run bot.init() once on first use; later requests reuse the same promise. */
let botInitPromise: Promise<void> | null = null;
function ensureBotInit(): Promise<void> {
  if (!bot) return Promise.resolve();
  if (!botInitPromise) botInitPromise = bot.init();
  return botInitPromise;
}

// Vercel production alias (VERCEL_PROJECT_PRODUCTION_URL) or deployment URL (VERCEL_URL).
const BASE_URL =
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : '';

function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function setWebhook(): Promise<{ ok?: boolean } | null> {
  if (!BOT_TOKEN || !BASE_URL) return null;
  const url = `${BASE_URL}/api/bot`;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  return data;
}

async function getWebhookInfo(): Promise<{ url?: string }> {
  if (!BOT_TOKEN) return {};
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = (await res.json()) as { ok?: boolean; result?: { url?: string } };
    return data?.result ?? {};
  } catch {
    return {};
  }
}

export async function handleRequest(request: Request): Promise<Response> {
  const method = request.method;
  console.log('[webhook]', method, new Date().toISOString());

  if (method === 'OPTIONS') return jsonResponse({}, 200);

  if (method === 'GET') {
    const expectedUrl = BASE_URL ? `${BASE_URL}/api/bot` : '';
    const current = await getWebhookInfo();
    if (BASE_URL && BOT_TOKEN) {
      const result = await setWebhook();
      return jsonResponse({
        ok: true,
        webhook_set: result?.ok === true,
        url: expectedUrl,
        telegram_has: current.url || '(none)',
      });
    }
    return jsonResponse({
      ok: true,
      service: 'telegram-bot',
      bot: !!BOT_TOKEN,
      vercel_url_set: !!BASE_URL,
      expected_url: expectedUrl || '(set VERCEL_URL / VERCEL_PROJECT_PRODUCTION_URL)',
      telegram_has: current.url || '(none)',
    });
  }

  if (method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }
  if (!BOT_TOKEN || !bot) {
    return jsonResponse({ ok: false, error: 'BOT_TOKEN not set' }, 500);
  }

  // Return 200 immediately so Telegram does not delay or hide the user's message.
  // Read body and process update inside waitUntil so the next request is not blocked.
  waitUntil(
    (async () => {
      let update: TelegramUpdate;
      try {
        const body =
          typeof request.json === 'function'
            ? await request.json()
            : (request as unknown as { body?: unknown }).body;
        update =
          typeof body === 'string'
            ? (JSON.parse(body) as TelegramUpdate)
            : (body as TelegramUpdate);
      } catch {
        console.error('[webhook] invalid_body');
        return;
      }
      if (!update || typeof update !== 'object') {
        console.error('[webhook] invalid update');
        return;
      }
      const updateId = update.update_id;
      console.log('[webhook] POST update', updateId);
      try {
        await ensureBotInit();
        await bot!.handleUpdate(update);
        console.log('[webhook] handled update', updateId);
      } catch (err) {
        console.error('[bot]', err);
      }
    })(),
  );
  return jsonResponse({ ok: true });
}

/** Legacy (req, res) handler; also used when Vercel passes (request, context). */
export interface NodeRes {
  setHeader(name: string, value: string): void;
  status(code: number): { json(data: unknown): void; end(): void };
  end(): void;
}

export interface NodeReq {
  method: string;
  body?: unknown;
}

async function legacyHandler(req: NodeReq, res: NodeRes): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') {
    const expectedUrl = BASE_URL ? `${BASE_URL}/api/bot` : '';
    const current = await getWebhookInfo();
    if (BASE_URL && BOT_TOKEN) {
      const result = await setWebhook();
      res.status(200).json({
        ok: true,
        webhook_set: result?.ok === true,
        url: expectedUrl,
        telegram_has: current.url || '(none)',
      });
    } else {
      res.status(200).json({
        ok: true,
        service: 'telegram-bot',
        bot: !!BOT_TOKEN,
        vercel_url_set: !!BASE_URL,
        expected_url: expectedUrl || '(set VERCEL_URL / VERCEL_PROJECT_PRODUCTION_URL)',
        telegram_has: current.url || '(none)',
      });
    }
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!BOT_TOKEN || !bot) {
    res.status(500).json({ ok: false, error: 'BOT_TOKEN not set' });
    return;
  }
  let update: TelegramUpdate = req.body as TelegramUpdate;
  if (typeof update === 'string') {
    try {
      update = JSON.parse(update) as TelegramUpdate;
    } catch {
      res.status(400).json({ ok: false, error: 'invalid_body' });
      return;
    }
  }
  if (!update || typeof update !== 'object') {
    res.status(400).json({ ok: false, error: 'invalid_body' });
    return;
  }
  try {
    await ensureBotInit();
    await bot.handleUpdate(update);
  } catch (err) {
    console.error('[bot]', err);
    res.status(500).json({ ok: false, error: 'handler_error' });
    return;
  }
  res.status(200).json({ ok: true });
}

export default async function handler(
  request: Request | NodeReq,
  context?: NodeRes,
): Promise<Response | void> {
  if (request && typeof (request as Request).json === 'function') {
    return handleRequest(request as Request);
  }
  return legacyHandler(request as NodeReq, context!);
}
