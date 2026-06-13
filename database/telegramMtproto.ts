import { sql } from "./start.js";

export type MtprotoSessionRow = {
  telegram_username: string;
  telegram_user_id: number | null;
  status: string;
  tdlib_db_path: string;
  connected_at: string;
  last_sync_at: string | null;
};

export async function getMtprotoSession(
  telegramUsername: string,
): Promise<MtprotoSessionRow | null> {
  const rows = (await sql`
    SELECT telegram_username, telegram_user_id, status, tdlib_db_path, connected_at, last_sync_at
    FROM telegram_mtproto_sessions
    WHERE telegram_username = ${telegramUsername}
    LIMIT 1;
  `) as {
    telegram_username: string;
    telegram_user_id: string | number | null;
    status: string;
    tdlib_db_path: string;
    connected_at: string;
    last_sync_at: string | null;
  }[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    telegram_user_id: row.telegram_user_id != null ? Number(row.telegram_user_id) : null,
  };
}

export async function isMtprotoSessionActive(telegramUsername: string): Promise<boolean> {
  const row = await getMtprotoSession(telegramUsername);
  return row?.status === "active";
}

export async function upsertMtprotoSession(input: {
  telegramUsername: string;
  telegramUserId?: number | null;
  tdlibDbPath: string;
  status?: "active" | "pending" | "revoked";
}): Promise<void> {
  const status = input.status ?? "active";
  await sql`
    INSERT INTO telegram_mtproto_sessions (
      telegram_username, telegram_user_id, status, tdlib_db_path, connected_at, revoked_at, last_sync_at
    )
    VALUES (
      ${input.telegramUsername},
      ${input.telegramUserId ?? null},
      ${status},
      ${input.tdlibDbPath},
      NOW(),
      NULL,
      NOW()
    )
    ON CONFLICT (telegram_username) DO UPDATE
      SET telegram_user_id = COALESCE(EXCLUDED.telegram_user_id, telegram_mtproto_sessions.telegram_user_id),
          status = EXCLUDED.status,
          tdlib_db_path = EXCLUDED.tdlib_db_path,
          connected_at = CASE
            WHEN telegram_mtproto_sessions.status = 'revoked' THEN NOW()
            ELSE telegram_mtproto_sessions.connected_at
          END,
          revoked_at = NULL,
          last_sync_at = NOW();
  `;
}

export async function touchMtprotoSync(telegramUsername: string): Promise<void> {
  await sql`
    UPDATE telegram_mtproto_sessions
    SET last_sync_at = NOW()
    WHERE telegram_username = ${telegramUsername};
  `;
}

export async function revokeMtprotoSession(telegramUsername: string): Promise<void> {
  await sql`
    UPDATE telegram_mtproto_sessions
    SET status = 'revoked', revoked_at = NOW()
    WHERE telegram_username = ${telegramUsername};
  `;
}
