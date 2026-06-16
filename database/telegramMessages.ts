import { sql } from "./start.js";
import { isMtprotoSessionActive } from "./telegramMtproto.js";
import { TELEGRAM_THREAD_NO_AVATAR } from "../shared/telegramThreadConstants.js";

export { TELEGRAM_THREAD_NO_AVATAR };

export type TelegramThreadRow = {
  id: number;
  telegram_chat_id: number;
  title: string;
  subtitle: string | null;
  avatar_url: string | null;
  last_message_at: string;
  unread_count: number;
};

type ConnectionRow = {
  telegram_username: string;
  status: string;
  connected_at: string;
};

/** Demo chat ids seeded before TDLib (legacy). Real sync removes these. */
const DEMO_CHAT_ID_MIN = 1001;
const DEMO_CHAT_ID_MAX = 1005;

export async function isTelegramMessagesConnected(telegramUsername: string): Promise<boolean> {
  if (await isMtprotoSessionActive(telegramUsername)) {
    return true;
  }
  const rows = (await sql`
    SELECT status FROM telegram_messages_connections
    WHERE telegram_username = ${telegramUsername}
    LIMIT 1;
  `) as { status: string }[];
  return rows[0]?.status === "active";
}

export async function getConnection(telegramUsername: string): Promise<ConnectionRow | null> {
  const rows = (await sql`
    SELECT telegram_username, status, connected_at
    FROM telegram_messages_connections
    WHERE telegram_username = ${telegramUsername}
    LIMIT 1;
  `) as ConnectionRow[];
  return rows[0] ?? null;
}

/** Mark product-level “messages connected” after TDLib auth + initial sync. */
export async function markTelegramMessagesConnected(telegramUsername: string): Promise<void> {
  await sql`
    INSERT INTO telegram_messages_connections (telegram_username, status, connected_at, revoked_at)
    VALUES (${telegramUsername}, 'active', NOW(), NULL)
    ON CONFLICT (telegram_username) DO UPDATE
      SET status = 'active',
          connected_at = NOW(),
          revoked_at = NULL;
  `;
}

export async function disconnectTelegramMessages(telegramUsername: string): Promise<void> {
  await sql`
    UPDATE telegram_messages_connections
    SET status = 'revoked', revoked_at = NOW()
    WHERE telegram_username = ${telegramUsername};
  `;
}

export async function clearDemoThreads(telegramUsername: string): Promise<void> {
  await sql`
    DELETE FROM telegram_threads
    WHERE telegram_username = ${telegramUsername}
      AND telegram_chat_id >= ${DEMO_CHAT_ID_MIN}
      AND telegram_chat_id <= ${DEMO_CHAT_ID_MAX};
  `;
}

export async function upsertTelegramThread(input: {
  telegramUsername: string;
  telegramChatId: number;
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  lastMessageAt: string;
  unreadCount: number;
}): Promise<void> {
  await sql`
    INSERT INTO telegram_threads (
      telegram_username, telegram_chat_id, title, subtitle, avatar_url,
      last_message_at, unread_count, created_at, updated_at
    )
    VALUES (
      ${input.telegramUsername},
      ${input.telegramChatId},
      ${input.title},
      ${input.subtitle},
      ${input.avatarUrl},
      ${input.lastMessageAt}::timestamptz,
      ${input.unreadCount},
      NOW(),
      NOW()
    )
    ON CONFLICT (telegram_username, telegram_chat_id) DO UPDATE
      SET title = EXCLUDED.title,
          subtitle = CASE
            WHEN EXCLUDED.subtitle IS NOT NULL AND BTRIM(EXCLUDED.subtitle) <> '' THEN EXCLUDED.subtitle
            ELSE telegram_threads.subtitle
          END,
          avatar_url = CASE
            WHEN EXCLUDED.avatar_url IS NOT NULL THEN EXCLUDED.avatar_url
            ELSE telegram_threads.avatar_url
          END,
          last_message_at = EXCLUDED.last_message_at,
          unread_count = EXCLUDED.unread_count,
          updated_at = NOW();
  `;
}

export async function pruneTelegramThreadsBefore(
  telegramUsername: string,
  beforeIso: string,
): Promise<number> {
  const rows = (await sql`
    DELETE FROM telegram_threads
    WHERE telegram_username = ${telegramUsername}
      AND updated_at < ${beforeIso}::timestamptz
    RETURNING id;
  `) as { id: string | number }[];
  return rows.length;
}

export async function listIncompleteTelegramThreads(
  telegramUsername: string,
  limit = 50,
): Promise<{ telegram_chat_id: number }[]> {
  const rows = (await sql`
    SELECT telegram_chat_id
    FROM telegram_threads
    WHERE telegram_username = ${telegramUsername}
      AND (
        avatar_url IS NULL
        OR subtitle IS NULL
        OR BTRIM(subtitle) = ''
      )
    ORDER BY last_message_at DESC, id DESC
    LIMIT ${limit};
  `) as { telegram_chat_id: string | number }[];
  return rows.map((row) => ({ telegram_chat_id: Number(row.telegram_chat_id) }));
}

export async function countIncompleteTelegramThreads(telegramUsername: string): Promise<{
  missingAvatars: number;
  missingSubtitles: number;
}> {
  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE avatar_url IS NULL)::int AS missing_avatars,
      COUNT(*) FILTER (WHERE subtitle IS NULL OR BTRIM(subtitle) = '')::int AS missing_subtitles
    FROM telegram_threads
    WHERE telegram_username = ${telegramUsername};
  `) as { missing_avatars: string | number; missing_subtitles: string | number }[];
  const row = rows[0];
  return {
    missingAvatars: Number(row?.missing_avatars) || 0,
    missingSubtitles: Number(row?.missing_subtitles) || 0,
  };
}

export async function listTelegramThreads(telegramUsername: string): Promise<TelegramThreadRow[]> {
  const rows = (await sql`
    SELECT id, telegram_chat_id, title, subtitle, avatar_url, last_message_at, unread_count
    FROM telegram_threads
    WHERE telegram_username = ${telegramUsername}
    ORDER BY last_message_at DESC, id DESC;
  `) as {
    id: string | number;
    telegram_chat_id: string | number;
    title: string;
    subtitle: string | null;
    avatar_url: string | null;
    last_message_at: string;
    unread_count: string | number;
  }[];

  return rows.map((r) => ({
    id: Number(r.id),
    telegram_chat_id: Number(r.telegram_chat_id),
    title: r.title,
    subtitle: r.subtitle,
    avatar_url: r.avatar_url,
    last_message_at: r.last_message_at,
    unread_count: Number(r.unread_count) || 0,
  }));
}
