/**
 * Set Telegram webhook on deploy. Run during Vercel build.
 * Requires BOT_TOKEN and either SELF_URL (recommended) or VERCEL_URL.
 * In Vercel: add BOT_TOKEN and SELF_URL (e.g. https://hsbexpo.vercel.app) and assign to Production (and enable for Build).
 */

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const SELF_URL = (process.env.SELF_URL ?? '').replace(/\/$/, '');
const VERCEL_URL = process.env.VERCEL_URL;
const baseUrl = SELF_URL || (VERCEL_URL ? `https://${VERCEL_URL}` : '');

const WEBHOOK_PATH = '/api/bot';
const FETCH_TIMEOUT_MS = 15_000;

async function setWebhook(): Promise<void> {
  console.log('[set-webhook] env: VERCEL_ENV=%s VERCEL_URL=%s SELF_URL=%s', process.env.VERCEL_ENV ?? '', VERCEL_URL ?? '(none)', SELF_URL || '(none)');

  if (!BOT_TOKEN) {
    console.log('[set-webhook] Skip: BOT_TOKEN not set. Add BOT_TOKEN in Vercel → Settings → Environment Variables (Production, include in Build).');
    return;
  }

  if (!baseUrl) {
    console.error('[set-webhook] BOT_TOKEN is set but no webhook URL. Set SELF_URL (e.g. https://hsbexpo.vercel.app) in Vercel env and assign to Production/Build.');
    process.exit(1);
  }

  const url = `${baseUrl}${WEBHOOK_PATH}`;
  console.log('[set-webhook] Setting webhook to:', url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (data.ok) {
    console.log('[set-webhook] OK:', url);
    return;
  }

  console.error('[set-webhook] Telegram setWebhook failed:', data.description ?? data);
  process.exit(1);
}

setWebhook()
  .then(() => process.exit(0))
  .catch((err: Error) => {
    console.error('[set-webhook] Error:', err.message);
    process.exit(1);
  });
