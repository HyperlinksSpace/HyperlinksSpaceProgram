import crypto from 'crypto';
import { getSessionByHash } from '../../database/telegramAuth.js';
import { normalizeUsername } from '../../database/users.js';
import { sha256Hex } from '../_lib/telegram-oidc.js';

const SESSION_COOKIE = 'hs_auth_session';

type TelegramUserPayload = {
  username?: string;
  language_code?: string;
  [key: string]: unknown;
};

type VerifiedInitData = {
  user?: TelegramUserPayload;
  [key: string]: unknown;
};

const TELEGRAM_WEBAPP_PUBLIC_KEY_RAW = Buffer.from(
  'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
  'hex',
);
const ED25519_SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex');
const TELEGRAM_WEBAPP_PUBLIC_KEY = crypto.createPublicKey({
  key: Buffer.concat([
    ED25519_SPKI_HEADER,
    Buffer.from([0]),
    TELEGRAM_WEBAPP_PUBLIC_KEY_RAW,
  ]),
  format: 'der',
  type: 'spki',
});

function verifyTelegramWebAppInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = 24 * 3600,
): VerifiedInitData | null {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const data: Record<string, string> = {};
    for (const [key, value] of params.entries()) data[key] = value;

    const authDateStr = data.auth_date;
    if (authDateStr) {
      const authDate = Number(authDateStr);
      if (!Number.isFinite(authDate)) return null;
      const now = Math.floor(Date.now() / 1000);
      if (authDate > now + 60) return null;
      if (maxAgeSeconds != null && now - authDate > maxAgeSeconds) return null;
    }

    const receivedHash = data.hash;
    const receivedSignature = data.signature;

    if (receivedHash) {
      const dataForHash = { ...data };
      delete dataForHash.hash;
      const sorted = Object.keys(dataForHash)
        .sort()
        .map((k) => `${k}=${dataForHash[k]}`)
        .join('\n');
      const dataCheckString = Buffer.from(sorted, 'utf8');
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
      const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
      const valid =
        receivedHash.length === computedHash.length &&
        crypto.timingSafeEqual(
          Buffer.from(receivedHash, 'hex'),
          Buffer.from(computedHash, 'hex'),
        );
      if (!valid) return null;
    } else if (receivedSignature) {
      const botId = botToken.split(':')[0];
      if (!botId) return null;
      const dataForSig = { ...data };
      delete dataForSig.hash;
      delete dataForSig.signature;
      const sorted = Object.keys(dataForSig)
        .sort()
        .map((k) => `${k}=${dataForSig[k]}`)
        .join('\n');
      const dataCheckString = `${botId}:WebAppData\n${sorted}`;
      const base64 = receivedSignature.replace(/-/g, '+').replace(/_/g, '/');
      const pad = (4 - (base64.length % 4)) % 4;
      const sigBuffer = Buffer.from(base64 + '='.repeat(pad), 'base64');
      const ok = crypto.verify(
        null,
        Buffer.from(dataCheckString, 'utf8'),
        TELEGRAM_WEBAPP_PUBLIC_KEY,
        sigBuffer,
      );
      if (!ok) return null;
    } else {
      return null;
    }

    const result: VerifiedInitData = { ...data };
    delete result.hash;
    delete result.signature;
    if (data.user) {
      try {
        result.user = JSON.parse(data.user) as TelegramUserPayload;
      } catch {
        return null;
      }
    }
    return result;
  } catch {
    return null;
  }
}

export type AuthResult = {
  telegramUsername: string;
  locale: string | null;
};

export function authByInitData(initData: string): AuthResult {
  const botToken = (process.env.BOT_TOKEN || '').trim();
  if (!botToken) {
    throw new Error('bot_token_not_configured');
  }
  const verified = verifyTelegramWebAppInitData(initData, botToken);
  if (!verified) {
    throw new Error('invalid_initdata');
  }
  const user =
    verified.user && typeof verified.user === 'object'
      ? (verified.user as TelegramUserPayload)
      : {};
  const telegramUsername = normalizeUsername(user.username);
  if (!telegramUsername) {
    throw new Error('username_required');
  }
  const locale =
    typeof user.language_code === 'string' ? user.language_code : null;
  return { telegramUsername, locale };
}

type CookieRequest = Request | {
  headers?: Headers | Record<string, string | string[] | undefined>;
};

function getHeader(request: CookieRequest, name: string): string | null {
  const lower = name.toLowerCase();
  const webHeaders = (request as Request).headers as Headers | undefined;
  if (webHeaders && typeof webHeaders.get === 'function') {
    return webHeaders.get(name);
  }
  const nodeHeaders = (request as { headers?: Record<string, string | string[] | undefined> }).headers;
  if (!nodeHeaders) return null;
  const raw = nodeHeaders[lower];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === 'string' ? raw : null;
}

function getCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';').map((p) => p.trim());
  for (const p of pairs) {
    if (!p.startsWith(`${key}=`)) continue;
    const raw = p.slice(key.length + 1);
    return decodeURIComponent(raw);
  }
  return null;
}

/** Browser OAuth session (`hs_auth_session` cookie), e.g. Google sign-in on welcome. */
export async function authBySessionCookie(request: CookieRequest): Promise<AuthResult | null> {
  const token = getCookieValue(getHeader(request, 'cookie'), SESSION_COOKIE);
  if (!token) return null;
  const row = await getSessionByHash(sha256Hex(token));
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  const telegramUsername = normalizeUsername(row.telegram_username);
  if (!telegramUsername) return null;
  return { telegramUsername, locale: null };
}

/** Telegram Mini App initData, or browser session cookie when initData is absent. */
export async function authWalletRequest(
  request: CookieRequest,
  initData: string,
): Promise<AuthResult> {
  const trimmed = initData.trim();
  if (trimmed) {
    return authByInitData(trimmed);
  }
  const fromSession = await authBySessionCookie(request);
  if (fromSession) {
    return fromSession;
  }
  throw new Error('missing_auth');
}

