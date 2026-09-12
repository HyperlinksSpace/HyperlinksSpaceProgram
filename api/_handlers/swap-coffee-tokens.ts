/**
 * Proxy Swap.Coffee Tokens API for Electron (`app://`) and other non-http shells.
 *
 * GET /api/swap-coffee-tokens?page=1&size=100
 * GET /api/swap-coffee-tokens?wallet=<ton-address>
 *
 * Catalog listing uses Tokens API v2 (`/api/v2/tokens`). Account balances still
 * use v3 accounts jettons (that path remains healthy).
 */

import { applyAuthApiCors, authApiPreflightResponse } from "../_lib/auth-cors.js";

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

const COFFEE_TOKENS_BASE_URL =
  process.env.COFFEE_TOKENS_BASE_URL?.trim() || "https://tokens.swap.coffee";
const COFFEE_API_KEY = process.env.COFFEE?.trim() || "";

function jsonError(message: string, status: number, request: Request): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  applyAuthApiCors(request, headers);
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers });
}

async function handler(request: Request, res?: NodeRes): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return preflight;

  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    const body = JSON.stringify({ ok: false, error: "Method not allowed" });
    if (res) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(405);
      res.end(body);
      return;
    }
    return jsonError("Method not allowed", 405, request);
  }

  let incoming: URL;
  try {
    incoming = new URL(request.url);
  } catch {
    return jsonError("bad_request", 400, request);
  }

  const wallet = incoming.searchParams.get("wallet")?.trim() ?? "";
  const base = COFFEE_TOKENS_BASE_URL.replace(/\/$/, "");
  const target = wallet
    ? new URL(`${base}/api/v3/accounts/${encodeURIComponent(wallet)}/jettons`)
    : new URL(`${base}/api/v2/tokens`);

  if (!wallet) {
    for (const [key, value] of incoming.searchParams.entries()) {
      if (key === "wallet" || key === "verification") continue;
      target.searchParams.append(key, value);
    }
    if (!target.searchParams.has("page")) target.searchParams.set("page", "1");
    if (!target.searchParams.has("size")) target.searchParams.set("size", "100");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (COFFEE_API_KEY) headers["X-Api-Key"] = COFFEE_API_KEY;

  try {
    const upstream = await fetch(target.toString(), {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    const text = await upstream.text();
    const outHeaders = new Headers({
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30",
    });
    applyAuthApiCors(request, outHeaders);

    if (res) {
      for (const [name, value] of outHeaders.entries()) {
        res.setHeader(name, value);
      }
      res.status(upstream.status);
      res.end(text);
      return;
    }

    return new Response(text, { status: upstream.status, headers: outHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[swap-coffee-tokens] upstream fetch failed:", message);
    if (res) {
      const body = JSON.stringify({ ok: false, error: "upstream_unavailable", detail: message });
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(502);
      res.end(body);
      return;
    }
    return jsonError(`upstream_unavailable: ${message}`, 502, request);
  }
}

export default handler;
export const GET = handler;
export const OPTIONS = handler;
