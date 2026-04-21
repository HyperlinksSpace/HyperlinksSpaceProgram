import dotenv from "dotenv";
import path from "path";

// Local-only: try to load .env / .env.local when running tools like db:migrate.
// In Vercel Lambdas these files don't exist, so these calls are harmless no-ops.
const cwd = process.cwd();
dotenv.config({ path: path.join(cwd, ".env") });
dotenv.config({ path: path.join(cwd, ".env.local") });
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail fast on the server side so misconfiguration is obvious in logs.
  throw new Error(
    "DATABASE_URL is not set. Configure it in ./.env for the current Neon branch.",
  );
}

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

  // messages table (AI: bot + TMA)
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id                  BIGSERIAL PRIMARY KEY,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_telegram       TEXT NOT NULL REFERENCES users(telegram_username),
      thread_id           BIGINT NOT NULL,
      type                TEXT NOT NULL CHECK (type IN ('bot', 'app')),
      role                TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content             TEXT,
      telegram_update_id  BIGINT
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_messages_thread
      ON messages(user_telegram, thread_id, type, created_at);
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_bot_update_id
      ON messages(user_telegram, thread_id, type, telegram_update_id)
      WHERE telegram_update_id IS NOT NULL;
  `;

  // Telegram OIDC/browser login attempts (state/nonce/PKCE replay protection).
  await sql`
    CREATE TABLE IF NOT EXISTS auth_login_attempts (
      id                  TEXT PRIMARY KEY,
      provider            TEXT NOT NULL,
      state_hash          TEXT NOT NULL UNIQUE,
      nonce_hash          TEXT NOT NULL,
      pkce_verifier       TEXT NOT NULL,
      redirect_uri        TEXT NOT NULL,
      status              TEXT NOT NULL CHECK (status IN ('created', 'consumed', 'expired', 'failed')),
      ip                  TEXT,
      user_agent          TEXT,
      error_code          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at          TIMESTAMPTZ NOT NULL,
      consumed_at         TIMESTAMPTZ
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_status_exp
      ON auth_login_attempts(status, expires_at);
  `;

  // Stable external auth mapping (Telegram subject -> local username).
  await sql`
    CREATE TABLE IF NOT EXISTS auth_identities (
      id                  BIGSERIAL PRIMARY KEY,
      provider            TEXT NOT NULL,
      provider_subject    TEXT NOT NULL,
      telegram_username   TEXT NOT NULL REFERENCES users(telegram_username),
      telegram_id         TEXT,
      username            TEXT,
      display_name        TEXT,
      picture_url         TEXT,
      phone_number        TEXT,
      claims_version      TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at       TIMESTAMPTZ
    );
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_provider_subject
      ON auth_identities(provider, provider_subject);
  `;

  // Auditable auth lifecycle events (no token bodies).
  await sql`
    CREATE TABLE IF NOT EXISTS auth_login_events (
      id                  BIGSERIAL PRIMARY KEY,
      attempt_id          TEXT,
      provider            TEXT NOT NULL,
      event_type          TEXT NOT NULL,
      telegram_username   TEXT,
      provider_subject    TEXT,
      request_id          TEXT,
      ip                  TEXT,
      user_agent          TEXT,
      meta_json           JSONB,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_login_events_attempt
      ON auth_login_events(attempt_id, created_at);
  `;

  // Browser/app session store (cookie token hash -> telegram username).
  await sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_hash        TEXT PRIMARY KEY,
      telegram_username   TEXT NOT NULL REFERENCES users(telegram_username),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at          TIMESTAMPTZ NOT NULL,
      last_seen_at        TIMESTAMPTZ,
      ip                  TEXT,
      user_agent          TEXT
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_exp
      ON auth_sessions(expires_at);
  `;
}

let schemaInitPromise: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaInitPromise) {
    schemaInitPromise = runSchemaMigrations().catch((err) => {
      console.error("[db] schema init failed", err);
      schemaInitPromise = null;
      throw err;
    });
  }
  return schemaInitPromise;
}

// Schema runs at deploy via `npm run db:migrate` in buildCommand. No schema work
// in the request path — keeps /api/telegram and other routes fast (no 504).

