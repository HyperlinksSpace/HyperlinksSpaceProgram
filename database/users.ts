/**
 * User helpers for the users table. Shared by API routes and bot.
 * Import from ../database/users.js (e.g. from api/, telegram/, bot/).
 */
import { randomInt } from "crypto";
import { sql } from "./start.js";

const DISPLAY_FIRST_NAMES = [
  "Avery",
  "Blake",
  "Casey",
  "Drew",
  "Ellis",
  "Finley",
  "Gray",
  "Harper",
  "Jordan",
  "Kai",
  "Logan",
  "Morgan",
  "Noel",
  "Parker",
  "Quinn",
  "Reese",
  "Rowan",
  "Sage",
  "Taylor",
  "Vale",
] as const;

const DISPLAY_LAST_NAMES = [
  "Ashford",
  "Bennett",
  "Caldwell",
  "Donovan",
  "Ellison",
  "Fairchild",
  "Grayson",
  "Holloway",
  "Iverson",
  "Jennings",
  "Kensington",
  "Langford",
  "Mercer",
  "Northcott",
  "Oakley",
  "Prescott",
  "Redfield",
  "Sterling",
  "Thornton",
  "Whitmore",
  "Yardley",
  "Zimmerman",
] as const;

export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  if (s.startsWith("@")) s = s.slice(1);
  return s.toLowerCase();
}

/** Human-readable profile label shown in the app header (not the Telegram handle). */
export function generateRandomDisplayName(): string {
  const first = DISPLAY_FIRST_NAMES[randomInt(DISPLAY_FIRST_NAMES.length)]!;
  const last = DISPLAY_LAST_NAMES[randomInt(DISPLAY_LAST_NAMES.length)]!;
  return `${first} ${last}`;
}

type UserUpsertRow = { display_name: string | null };

async function readDisplayNameRow(telegramUsername: string): Promise<string | null> {
  const rows = (await sql`
    SELECT display_name FROM users WHERE telegram_username = ${telegramUsername} LIMIT 1;
  `) as UserUpsertRow[];
  const name = rows[0]?.display_name;
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
}

/** Ensures a display name exists; backfills legacy rows that predate the column. */
export async function getDisplayNameForUsername(telegramUsername: string): Promise<string> {
  const existing = await readDisplayNameRow(telegramUsername);
  if (existing) return existing;

  const generated = generateRandomDisplayName();
  await sql`
    UPDATE users
    SET display_name = ${generated}, updated_at = NOW()
    WHERE telegram_username = ${telegramUsername}
      AND (display_name IS NULL OR TRIM(display_name) = '');
  `;
  return (await readDisplayNameRow(telegramUsername)) ?? generated;
}

export async function upsertUserFromTma(opts: {
  telegramUsername: string;
  locale: string | null;
}): Promise<{ displayName: string } | null> {
  const { telegramUsername, locale } = opts;
  if (!telegramUsername) return null;

  const rows = (await sql`
    INSERT INTO users (telegram_username, display_name, locale, created_at, updated_at, last_tma_seen_at)
    VALUES (${telegramUsername}, ${generateRandomDisplayName()}, ${locale}, NOW(), NOW(), NOW())
    ON CONFLICT (telegram_username) DO UPDATE
      SET locale = EXCLUDED.locale,
          last_tma_seen_at = NOW(),
          updated_at = NOW()
    RETURNING display_name;
  `) as UserUpsertRow[];

  const displayName = rows[0]?.display_name;
  if (typeof displayName === "string" && displayName.trim().length > 0) {
    return { displayName: displayName.trim() };
  }
  return { displayName: await getDisplayNameForUsername(telegramUsername) };
}

export async function upsertUserFromBot(opts: {
  telegramUsername: string;
  locale: string | null;
}): Promise<{ displayName: string } | null> {
  const { telegramUsername, locale } = opts;
  if (!telegramUsername) return null;

  const rows = (await sql`
    INSERT INTO users (telegram_username, display_name, locale, created_at, updated_at, last_login_at)
    VALUES (${telegramUsername}, ${generateRandomDisplayName()}, ${locale}, NOW(), NOW(), NOW())
    ON CONFLICT (telegram_username) DO UPDATE
      SET locale = EXCLUDED.locale,
          last_login_at = NOW(),
          updated_at = NOW()
    RETURNING display_name;
  `) as UserUpsertRow[];

  const displayName = rows[0]?.display_name;
  if (typeof displayName === "string" && displayName.trim().length > 0) {
    return { displayName: displayName.trim() };
  }
  return { displayName: await getDisplayNameForUsername(telegramUsername) };
}
