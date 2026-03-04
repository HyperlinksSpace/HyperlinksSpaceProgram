const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Node res: send body and end so the client gets the response (Vercel uses (req, res) in prod). */
function sendViaRes(res: { status: (n: number) => void; setHeader: (k: string, v: string) => void; end: (s?: string) => void }, body: object, status: number): void {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Thin router: GET returns immediately (no heavy deps). POST loads
 * the heavy handler from ./telegram/post so initData verification and
 * DB writes stay out of the fast path. When Vercel passes (req, res),
 * we must send via res so the client gets the response.
 */
async function handler(
  request: Request,
  res?: { status: (n: number) => void; setHeader: (k: string, v: string) => void; end: (s?: string) => void }
): Promise<Response | void> {
  const method = (request as { method?: string }).method ?? request.method;
  if (method === 'GET') {
    const body = { ok: true, endpoint: 'telegram', use: 'POST with initData' };
    if (res) {
      sendViaRes(res, body, 200);
      return;
    }
    return jsonResponse(body, 200);
  }
  if (method !== 'POST') {
    if (res) {
      res.status(405);
      res.end('Method Not Allowed');
      return;
    }
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const { handlePost } = await import('./telegram/post.js');
    const response = await handlePost(request);
    if (res) {
      res.status(response.status);
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await response.text());
      return;
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/telegram] POST error:', message, err instanceof Error ? err.stack : '');
    const body = { ok: false, error: message || 'internal_error' };
    if (res) {
      sendViaRes(res, body, 500);
      return;
    }
    return jsonResponse(body, 500);
  }
}

export default handler;
export const GET = handler;
export const POST = handler;
