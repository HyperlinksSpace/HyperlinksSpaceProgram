/**
 * Vercel API route: named GET/POST so Telegram webhook POST is handled.
 * Forwards to webhook default handler under api/bot-webhook so that all
 * serverless logic lives inside the api/ tree (no ../bot imports).
 */
import webhookHandler, {
  type NodeReq,
  type NodeRes,
} from './bot-webhook.js';

async function handler(
  request: Request | NodeReq,
  context?: NodeRes,
): Promise<Response | void> {
  return webhookHandler(request, context);
}

export default handler;
export const GET = handler;
export const POST = handler;
