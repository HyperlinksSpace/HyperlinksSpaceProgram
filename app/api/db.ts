import 'dotenv/config';
import { neon, neonConfig } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail fast on the server side so misconfiguration is obvious in logs.
  throw new Error('DATABASE_URL is not set. Configure it in ./app/.env for the current Neon branch.');
}

// Cache connections across invocations in serverless environments.
neonConfig.fetchConnectionCache = true;

export const sql = neon(connectionString);

async function runSchemaMigrations() {
  // users table
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      telegram_username   TEXT PRIMARY KEY,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at       TIMESTAMPTZ,
      last_tma_seen_at    TIMESTAMPTZ,
      locale              TEXT,
      time_zone           TEXT,
      number_of_wallets   INTEGER NOT NULL DEFAULT 0,
      default_wallet      BIGINT
    );
  `;

  // wallets table
  await sql`
    CREATE TABLE IF NOT EXISTS wallets (
      id                    BIGSERIAL PRIMARY KEY,
      telegram_username     TEXT NOT NULL REFERENCES users(telegram_username),
      wallet_address        TEXT NOT NULL,
      wallet_blockchain     TEXT NOT NULL,
      wallet_net            TEXT NOT NULL,
      type                  TEXT NOT NULL,
      label                 TEXT,
      is_default            BOOLEAN NOT NULL DEFAULT FALSE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at          TIMESTAMPTZ,
      last_seen_balance_at  TIMESTAMPTZ,
      source                TEXT,
      notes                 TEXT,
      UNIQUE (telegram_username, wallet_address, wallet_blockchain, wallet_net)
    );
  `;

  // pending_transactions table
  await sql`
    CREATE TABLE IF NOT EXISTS pending_transactions (
      id                TEXT PRIMARY KEY,
      telegram_username TEXT NOT NULL REFERENCES users(telegram_username),
      wallet_address    TEXT NOT NULL,
      wallet_blockchain TEXT NOT NULL,
      wallet_net        TEXT NOT NULL,
      payload           JSONB NOT NULL,
      status            TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'failed')),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  // Helpful indexes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_wallets_user
      ON wallets(telegram_username);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pending_tx_user
      ON pending_transactions(telegram_username);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pending_tx_status
      ON pending_transactions(status);
  `;
}

let schemaInitPromise: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaInitPromise) {
    schemaInitPromise = runSchemaMigrations().catch((err) => {
      console.error('[db] schema init failed', err);
      schemaInitPromise = null;
      throw err;
    });
  }
  return schemaInitPromise;
}

// Fire-and-forget initialization so that any API route importing this module
// will attempt to create the schema on first cold start of the lambda.
// Routes that need strong guarantees can also `await ensureSchema()` explicitly.
// eslint-disable-next-line @typescript-eslint/no-floating-promises
ensureSchema();

