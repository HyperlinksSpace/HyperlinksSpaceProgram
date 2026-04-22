/**
 * Single Vercel serverless entry for **single-segment** `/api/:segment` routes (Hobby plan limit).
 * Concrete handlers live in api/_handlers/*.
 *
 * Vercel does not send multi-segment paths (e.g. `/api/auth/session`) to this file — only one
 * dynamic segment after `/api/`. Those URLs need real files such as `api/auth/session.ts` or a
 * `vercel.json` rewrite to a single segment (see `/api/kms/ping` → `/api/wallet-envelope-ping`).
 *
 * `vercel dev` on Windows may spawn extra workers for both this catch-all and explicit `api/auth/*`
 * files; if a worker crashes (exit 3221226505), use `npm run web` or WSL.
 */

import aiHandler from './_handlers/ai.js';
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
      hint: 'See api/[...path].ts (single-segment routes) and api/**/*.ts for multi-segment paths; handlers in api/_handlers/',
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
