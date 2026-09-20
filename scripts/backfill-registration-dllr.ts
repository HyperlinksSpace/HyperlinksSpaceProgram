/**
 * Insert-only backfill: registration $1 DLLR (frozen) for users with no ledger row.
 * Never updates existing hot/frozen amounts.
 *
 * Usage:
 *   npx tsx scripts/backfill-registration-dllr.ts
 *
 * Uses DATABASE_URL_PROD or DATABASE_URL.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

async function main() {
  const url = (process.env.DATABASE_URL_PROD || process.env.DATABASE_URL || "").trim();
  if (!url) {
    console.error("DATABASE_URL_PROD / DATABASE_URL missing");
    process.exit(1);
  }
  // Point the app DB client at the chosen URL before importing modules that read it.
  process.env.DATABASE_URL = url;

  const { backfillRegistrationDllrGifts, DLLR_REGISTRATION_FROZEN_USD } = await import(
    "../database/dllrBalances.js"
  );
  const { ensureSchema } = await import("../database/start.js");
  await ensureSchema();
  const result = await backfillRegistrationDllrGifts();
  console.log(
    JSON.stringify(
      {
        ok: true,
        giftUsd: DLLR_REGISTRATION_FROZEN_USD,
        inserted: result.inserted,
        toppedUp: result.toppedUp,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
