/**
 * Vercel API route: named GET/POST so Telegram webhook POST is handled.
 * Forwards to webhook default handler so both Web Request and Node (req, res) are supported.
 */
import webhookHandler from '../bot/webhook';
import type { NodeReq, NodeRes } from '../bot/webhook';

async function handler(request: Request | NodeReq, context?: NodeRes): Promise<Response | void> {
  return webhookHandler(request, context);
}

export default handler;
export const GET = handler;
export const POST = handler;
