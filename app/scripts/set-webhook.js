#!/usr/bin/env node
/**
 * Set Telegram webhook. Run on Vercel during build.
<<<<<<< HEAD
 * Uses BOT_TOKEN and SELF_URL (production domain, e.g. https://hsbexpo.vercel.app) or else VERCEL_URL.
 * Set SELF_URL in Vercel so the webhook is your production URL; otherwise it uses the deployment URL.
=======
 * Uses BOT_TOKEN and SELF_URL (e.g. https://hsbexpo.vercel.app) or VERCEL_URL.
>>>>>>> upstream/main
 */
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const baseUrl = (process.env.SELF_URL || '').replace(/\/$/, '') || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

if (!BOT_TOKEN || !baseUrl) {
  console.log('[set-webhook] Skip: BOT_TOKEN or URL not set (set SELF_URL or VERCEL_URL)');
  process.exit(0);
}

const url = `${baseUrl}/api/bot`;

async function setWebhook() {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (data.ok) {
    console.log('[set-webhook] OK:', url);
  } else {
    console.warn('[set-webhook] Telegram API:', data.description || data);
  }
}

setWebhook().then(() => process.exit(0)).catch((err) => {
  console.warn('[set-webhook] Error:', err.message);
  process.exit(0);
});
