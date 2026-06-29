/**
 * GET /api/wallet-envelope-roundtrip — KMS encrypt/decrypt (@google-cloud/kms).
 * Public **`/api/kms-roundtrip`** (rewrite in vercel.json).
 *
 * Supports legacy Node `res` like `ping.ts` — `vercel dev` may pass `res` and expect
 * `res.end()` instead of returning a Web `Response`.
 */

import {
  getKmsKeyName,
  getKmsUsesRestTransport,
  hasExplicitKmsJsonCredentials,
  resolveServiceAccountKeyPath,
} from '../_lib/envelope-env.js';
import { kmsDecrypt, kmsEncrypt } from '../_lib/envelope-crypto.js';
import { appLog } from '../../shared/appLog.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const KMS_PING_MS = Math.min(
  Number(process.env.KMS_PING_TIMEOUT_MS) || 45_000,
  120_000,
);

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

function parseRequestUrl(request: Request): URL {
  const raw = request.url;
  if (!raw) {
    return new URL('http://127.0.0.1/api/kms-roundtrip');
  }
  try {
    return new URL(raw);
  } catch {
    return new URL(raw, 'http://127.0.0.1');
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label}_timeout_after_${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function sendJson(
  res: NodeRes | undefined,
  body: object,
  status: number,
): Response | void {
  const json = JSON.stringify(body);
  if (res) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status);
    res.end(json);
    return;
  }
  return new Response(json, { status, headers: JSON_HEADERS });
}

function authorizePing(request: Request): boolean {
  const secret = process.env.KMS_PING_SECRET?.trim();
  if (!secret) {
    return true;
  }
  const header = request.headers.get('x-kms-ping-secret');
  if (header === secret) return true;
  try {
    const url = parseRequestUrl(request);
    if (url.searchParams.get('secret') === secret) return true;
  } catch {
    /* ignore */
  }
  return false;
}

async function handler(
  request: Request,
  res?: NodeRes,
): Promise<Response | void> {
  const method = request.method ?? 'GET';
  if (method !== 'GET') {
    if (res) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(405);
      res.end('Method Not Allowed');
      return;
    }
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = parseRequestUrl(request);
  const wantsQuick = url.searchParams.get('quick') === '1';
  const wantsRoundtrip =
    url.searchParams.get('roundtrip') === '1' ||
    url.searchParams.get('full') === '1';

  if (!wantsQuick && !wantsRoundtrip) {
    return sendJson(
      res,
      {
        ok: false,
        error: 'missing_flags',
        hint: 'Use ?quick=1 or ?roundtrip=1 — or GET /api/kmsping for usage.',
      },
      400,
    );
  }

  if (!authorizePing(request)) {
    return sendJson(res, { ok: false, error: 'unauthorized' }, 401);
  }

  const keyName = getKmsKeyName();

  if (
    process.env.VERCEL_ENV === 'development' &&
    !hasExplicitKmsJsonCredentials() &&
    !resolveServiceAccountKeyPath()
  ) {
    return sendJson(
      res,
      {
        ok: false,
        error: 'no_service_account_key',
        cwd: process.cwd(),
        hint:
          'Put wallet-kms-unwrap-sa-key.json in the project root or set GOOGLE_APPLICATION_CREDENTIALS or GCP_SERVICE_ACCOUNT_JSON.',
      },
      200,
    );
  }

  try {
    const plain = Buffer.from('kms-ping', 'utf8');
    const transport = getKmsUsesRestTransport() ? 'rest' : 'grpc';
    appLog('[wallet-envelope-roundtrip]', 'encrypt_start', {
      keyName,
      transport,
      quick: wantsQuick,
    });
    const wrapped = await withTimeout(
      kmsEncrypt(plain),
      KMS_PING_MS,
      'kms_encrypt',
    );
    if (wantsQuick) {
      appLog('[wallet-envelope-roundtrip]', 'quick_done', {
        ciphertextBytes: wrapped.length,
      });
      return sendJson(
        res,
        {
          ok: true,
          quick: true,
          keyName,
          ciphertextBytes: wrapped.length,
          transport,
          hint: 'add ?roundtrip=1 for encrypt+decrypt (slow in vercel dev)',
        },
        200,
      );
    }
    appLog('[wallet-envelope-roundtrip]', 'decrypt_start');
    const unwrapped = await withTimeout(
      kmsDecrypt(wrapped),
      KMS_PING_MS,
      'kms_decrypt',
    );
    const match = plain.equals(unwrapped);
    appLog('[wallet-envelope-roundtrip]', 'done', {
      match,
      ciphertextBytes: wrapped.length,
    });
    return sendJson(
      res,
      {
        ok: true,
        roundtrip: match,
        keyName,
        ciphertextBytes: wrapped.length,
        transport,
      },
      200,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return sendJson(
      res,
      {
        ok: false,
        error: 'kms_roundtrip_failed',
        message,
        keyName,
      },
      500,
    );
  }
}

export default handler;
export const GET = handler;

