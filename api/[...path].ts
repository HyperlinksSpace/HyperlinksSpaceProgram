/**
 * Single Vercel serverless entry for all /api/* routes (Hobby plan function limit).
 * Concrete handlers live in api/_handlers/* (private — not deployed as separate routes).
 */

import aiHandler from './_handlers/ai.js';
import authSessionHandler from './_handlers/auth-session.js';
import authTelegramCallbackHandler from './_handlers/auth-telegram-callback.js';
import authTelegramStartHandler from './_handlers/auth-telegram-start.js';
import blockchainHandler from './_handlers/blockchain.js';
import botHandler from './_handlers/bot.js';
import pingHandler from './_handlers/ping.js';
import releasesHandler from './_handlers/releases.js';
import telegramHandler from './_handlers/telegram.js';
import walletEnvelopePingHandler from './_handlers/wallet-envelope-ping.js';
import walletEnvelopeProbeHandler from './_handlers/wallet-envelope-probe.js';
import walletEnvelopeRoundtripHandler from './_handlers/wallet-envelope-roundtrip.js';

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

type ApiHandler = (
  request: Request,
  res?: NodeRes,
) => Promise<Response | void>;

const ROUTES: Record<string, ApiHandler> = {
  ping: pingHandler as ApiHandler,
  bot: botHandler as ApiHandler,
  ai: aiHandler as ApiHandler,
  'auth/session': authSessionHandler as ApiHandler,
  'auth/telegram/start': authTelegramStartHandler as ApiHandler,
  'auth/telegram/callback': authTelegramCallbackHandler as ApiHandler,
  blockchain: blockchainHandler as ApiHandler,
  telegram: telegramHandler as ApiHandler,
  releases: releasesHandler as ApiHandler,
  'wallet-envelope-ping': walletEnvelopePingHandler as ApiHandler,
  'wallet-envelope-probe': walletEnvelopeProbeHandler as ApiHandler,
  'wallet-envelope-roundtrip': walletEnvelopeRoundtripHandler as ApiHandler,
  /** Public short paths from vercel.json rewrites (request URL may still show these segments). */
  kmsping: walletEnvelopePingHandler as ApiHandler,
  kmsprobe: walletEnvelopeProbeHandler as ApiHandler,
  'kms-roundtrip': walletEnvelopeRoundtripHandler as ApiHandler,
  'kms/ping': walletEnvelopePingHandler as ApiHandler,
  'kms-ping': walletEnvelopePingHandler as ApiHandler,
};

function routeKeyFromUrl(request: Request): string {
  const raw = request.url;
  if (!raw) return '';
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw.split('?')[0] ?? '';
  }
  const segments = pathname
    .replace(/^\/api\/?/i, '')
    .split('/')
    .filter(Boolean);
  return segments.join('/');
}

async function router(
  request: Request,
  res?: NodeRes,
): Promise<Response | void> {
  const key = routeKeyFromUrl(request);
  const handler = ROUTES[key];
  if (!handler) {
    const body = JSON.stringify({
      ok: false,
      error: 'not_found',
      path: key || '(empty)',
      hint: 'All API routes are served from this single function; see api/_handlers/',
    });
    if (res) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(404);
      res.end(body);
      return;
    }
    return new Response(body, {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  return handler(request, res);
}

export default router;
export const GET = router;
export const POST = router;
export const OPTIONS = router;
export const PUT = router;
export const PATCH = router;
export const DELETE = router;
