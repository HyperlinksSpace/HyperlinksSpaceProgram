/**
 * Set built-in DLLR ledger for a user (prod/local Neon).
 *
 * Usage:
 *   npx tsx scripts/set-dllr-balance.ts --email somewallet@gmail.com 1000000000
 *   npx tsx scripts/set-dllr-balance.ts --username <user> 1000000000
 *   npx tsx scripts/set-dllr-balance.ts --email user@x.com --hot 999999999 --frozen 1
 */
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

function normalizeUsername(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function resolveEmailUsername(email: string): string {
  return normalizeUsername(`email_${sha256Hex(email).slice(0, 24)}`);
}

function parseUsd(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 1e6) / 1e6;
}

async function main() {
  const url = (process.env.DATABASE_URL_PROD || process.env.DATABASE_URL || "").trim();
  if (!url) {
    console.error("DATABASE_URL_PROD / DATABASE_URL missing");
    process.exit(1);
  }
  const sql = neon(url);

  const args = process.argv.slice(2);
  let email: string | null = null;
  let username = "";
  let hot: number | null = null;
  let frozen = 0;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--email") {
      email = normalizeEmail(args[++i]);
      continue;
    }
    if (a === "--username") {
      username = normalizeUsername(args[++i]);
      continue;
    }
    if (a === "--hot") {
      hot = parseUsd(args[++i]);
      continue;
    }
    if (a === "--frozen") {
      frozen = parseUsd(args[++i]);
      if (!Number.isFinite(frozen)) frozen = 0;
      continue;
    }
    positional.push(a);
  }

  if (hot == null && positional[0] != null) {
    hot = parseUsd(positional[0]);
  }
  if (hot == null || !Number.isFinite(hot)) {
    console.error(
      "Usage: npx tsx scripts/set-dllr-balance.ts --email <email>|<--username user> <amount>|--hot N [--frozen N]",
    );
    process.exit(1);
  }
  if (!Number.isFinite(frozen) || frozen < 0) frozen = 0;

  console.log("db_host", new URL(url).hostname);

  await sql`
    CREATE TABLE IF NOT EXISTS user_dllr_balances (
      telegram_username TEXT PRIMARY KEY,
      hot_usd           DOUBLE PRECISION NOT NULL DEFAULT 0,
      frozen_usd        DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  let usernames: string[] = [];
  if (username) {
    usernames = [username];
  } else if (email) {
    const rows = (await sql`
      SELECT DISTINCT telegram_username
      FROM users
      WHERE lower(trim(coalesce(email, ''))) = ${email}
         OR lower(trim(coalesce(login_subject, ''))) = ${email}
      ORDER BY telegram_username ASC
      LIMIT 20
    `) as Array<{ telegram_username?: unknown }>;
    usernames = rows.map((r) => normalizeUsername(r.telegram_username)).filter(Boolean);
    const synthetic = resolveEmailUsername(email);
    if (!usernames.includes(synthetic)) {
      const exists = (await sql`
        SELECT 1 AS ok FROM users WHERE telegram_username = ${synthetic} LIMIT 1
      `) as Array<{ ok?: unknown }>;
      if (exists[0]) usernames.push(synthetic);
    }
    if (usernames.length === 0) {
      // Create ledger row keyed by synthetic email username even if profile is missing —
      // session will pick it up once that account exists / matches.
      usernames = [synthetic];
      console.warn("no users row for email; using synthetic username", synthetic);
    }
  } else {
    console.error("Provide --email or --username");
    process.exit(1);
  }

  console.log("usernames", usernames);
  console.log("setting", { hotUsd: hot, frozenUsd: frozen, total: hot + frozen });

  for (const u of usernames) {
    // Ensure users row exists for FK-less upsert (script table has no FK for resilience).
    await sql`
      INSERT INTO users (telegram_username, updated_at)
      VALUES (${u}, NOW())
      ON CONFLICT (telegram_username) DO NOTHING
    `;
    await sql`
      INSERT INTO user_dllr_balances (telegram_username, hot_usd, frozen_usd, updated_at)
      VALUES (${u}, ${hot}, ${frozen}, NOW())
      ON CONFLICT (telegram_username) DO UPDATE
      SET
        hot_usd = EXCLUDED.hot_usd,
        frozen_usd = EXCLUDED.frozen_usd,
        updated_at = NOW()
    `;
    const check = (await sql`
      SELECT hot_usd, frozen_usd FROM user_dllr_balances WHERE telegram_username = ${u} LIMIT 1
    `) as Array<{ hot_usd?: unknown; frozen_usd?: unknown }>;
    console.log("ok", u, check[0]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
