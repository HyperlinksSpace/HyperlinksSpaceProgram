import { sql } from "./start.js";
import { isMtprotoSessionActive } from "./telegramMtproto.js";

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
          subtitle = COALESCE(EXCLUDED.subtitle, telegram_threads.subtitle),
          avatar_url = COALESCE(EXCLUDED.avatar_url, telegram_threads.avatar_url),
          last_message_at = EXCLUDED.last_message_at,
          unread_count = EXCLUDED.unread_count,
          updated_at = NOW();
  `;
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
