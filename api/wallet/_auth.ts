import crypto from 'crypto';
import { normalizeUsername } from '../../database/users.js';

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

