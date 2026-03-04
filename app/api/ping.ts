/**
 * Zero-dependency health check.
 * GET /api/ping → { ok: true, ping: true }
 *
 * Supports both:
 * - Web API style (Request → Response)
 * - Legacy Node style (req, res)
 */

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handler(
  request: Request,
  res?: NodeRes,
): Promise<Response | void> {
  const body = { ok: true, ping: true };

  if (res) {
    res.setHeader('Content-Type', 'application/json');
    res.status(200);
    res.end(JSON.stringify(body));
    return;
  }

  return jsonResponse(body, 200);
}

export default handler;
export const GET = handler;

