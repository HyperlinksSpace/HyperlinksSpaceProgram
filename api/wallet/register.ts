import { registerWallet } from '../../database/wallets.js';
import { upsertUserFromTma } from '../../database/users.js';
import { authByInitData } from './_auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type RegisterRequestBody = {
  initData?: unknown;
  wallet_address?: unknown;
  wallet_blockchain?: unknown;
  wallet_net?: unknown;
  type?: unknown;
  label?: unknown;
  source?: unknown;
  [key: string]: unknown;
};

async function getBody(
  request:
    | Request
    | {
        json?: () => Promise<unknown>;
        body?: unknown;
      },
): Promise<unknown> {
  if (typeof (request as { json?: () => Promise<unknown> }).json === 'function') {
    return (request as Request).json();
  }
  return (request as { body?: unknown }).body ?? null;
}

function hasSensitiveFields(body: RegisterRequestBody): boolean {
  const forbidden = [
    'mnemonic',
    'seed',
    'private_key',
    'secret',
    'secret_key',
    'wallet_master_key',
    'wallet_seed_cipher',
  ];
  return forbidden.some((key) => key in body);
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function handler(request: Request): Promise<Response> {
  const method = (request as { method?: string }).method ?? request.method;
  if (method === 'GET') {
    return jsonResponse(
      {
        ok: true,
        endpoint: 'wallet/register',
        use: 'POST with initData + public wallet fields',
      },
      200,
    );
  }
  if (method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const rawBody = (await getBody(request)) as RegisterRequestBody | null;
  if (!rawBody || typeof rawBody !== 'object') {
    return jsonResponse({ ok: false, error: 'bad_json' }, 400);
  }
  if (hasSensitiveFields(rawBody)) {
    return jsonResponse(
      { ok: false, error: 'sensitive_fields_not_allowed' },
      400,
    );
  }

  const initData = toTrimmedString(rawBody.initData);
  if (!initData) return jsonResponse({ ok: false, error: 'missing_initData' }, 400);

  try {
    const auth = authByInitData(initData);
    await upsertUserFromTma({
      telegramUsername: auth.telegramUsername,
      locale: auth.locale,
    });

    const wallet_address = toTrimmedString(rawBody.wallet_address);
    const wallet_blockchain = toTrimmedString(rawBody.wallet_blockchain);
    const wallet_net = toTrimmedString(rawBody.wallet_net);
    const type = toTrimmedString(rawBody.type);
    const label = toTrimmedString(rawBody.label);
    const source = toTrimmedString(rawBody.source);

    if (!wallet_address || !wallet_blockchain || !wallet_net || !type) {
      return jsonResponse(
        {
          ok: false,
          error:
            'required_fields_missing (wallet_address, wallet_blockchain, wallet_net, type)',
        },
        400,
      );
    }

    const wallet = await registerWallet({
      telegramUsername: auth.telegramUsername,
      walletAddress: wallet_address,
      walletBlockchain: wallet_blockchain,
      walletNet: wallet_net,
      type,
      label: label || null,
      source: source || null,
      isDefault: true,
    });

    if (!wallet) {
      return jsonResponse({ ok: false, error: 'wallet_register_failed' }, 500);
    }

    return jsonResponse(
      {
        ok: true,
        telegram_username: auth.telegramUsername,
        has_wallet: true,
        wallet: {
          id: wallet.id,
          wallet_address: wallet.wallet_address,
          wallet_blockchain: wallet.wallet_blockchain,
          wallet_net: wallet.wallet_net,
          type: wallet.type,
          label: wallet.label,
          is_default: wallet.is_default,
          source: wallet.source,
        },
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal_error';
    const status = msg === 'bot_token_not_configured' ? 500 : msg === 'invalid_initdata' ? 401 : 400;
    return jsonResponse({ ok: false, error: msg }, status);
  }
}

export default handler;
export const GET = handler;
export const POST = handler;

