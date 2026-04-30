/**
 * Message helpers for the AI messages table (bot + TMA).
 * Shared by API routes and bot. Import from ../database/messages.js.
 */
import { sql } from './start.js';

export type MessageType = 'bot' | 'app';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: number;
  created_at: Date;
  telegram_username: string;
  thread_id: number;
  type: MessageType;
  role: MessageRole;
  content: string | null;
  telegram_update_id: number | null;
}

export interface InsertMessageOpts {
  telegram_username: string;
  thread_id: number;
  type: MessageType;
  role: MessageRole;
  content: string | null;
  telegram_update_id?: number | null;
}

/**
 * Insert a message. For bot user messages with telegram_update_id, the unique
 * constraint may conflict (duplicate webhook or another instance). Returns the
 * new row id, or null if insert was skipped due to unique violation.
 */
export async function insertMessage(
  opts: InsertMessageOpts,
): Promise<{ id: number } | null> {
  const {
    telegram_username,
    thread_id,
    type,
    role,
    content,
    telegram_update_id = null,
  } = opts;

  try {
    const rows = await sql`
      INSERT INTO messages (telegram_username, thread_id, type, role, content, telegram_update_id)
      VALUES (${telegram_username}, ${thread_id}, ${type}, ${role}, ${content}, ${telegram_update_id})
      RETURNING id;
    `;
    const row = rows[0] as { id: string } | undefined;
    if (!row) return null;
    return { id: Number(row.id) };
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === '23505') return null; // unique_violation (bot dedupe)
    throw err;
  }
}

/**
 * Messages for a thread, ordered by created_at ascending (oldest first, for AI history).
 */
export async function getThreadHistory(
  opts: {
    telegram_username: string;
    thread_id: number;
    type: MessageType;
    limit?: number;
  },
): Promise<Message[]> {
  const { telegram_username, thread_id, type, limit = 100 } = opts;
  const rows = await sql`
    SELECT id, created_at, telegram_username, thread_id, type, role, content, telegram_update_id
    FROM messages
    WHERE telegram_username = ${telegram_username} AND thread_id = ${thread_id} AND type = ${type}
    ORDER BY created_at ASC
    LIMIT ${limit};
  `;
  return (rows as RawMessageRow[]).map(rowToMessage);
}

/**
 * Max telegram_update_id for user messages in the thread (bot only). Used to check
 * "is the latest user message still the one I inserted?" before sending a reply.
 * Returns null if no user messages with telegram_update_id in the thread.
 */
export async function getMaxTelegramUpdateIdForThread(
  telegram_username: string,
  thread_id: number,
  type: MessageType,
): Promise<number | null> {
  const rows = await sql`
    SELECT MAX(telegram_update_id) AS max_id
    FROM messages
    WHERE telegram_username = ${telegram_username} AND thread_id = ${thread_id} AND type = ${type}
      AND role = 'user' AND telegram_update_id IS NOT NULL;
  `;
  const row = rows[0] as { max_id: string | null } | undefined;
  if (!row || row.max_id == null) return null;
  return Number(row.max_id);
}

interface RawMessageRow {
  id: string;
  created_at: Date;
  telegram_username: string;
  thread_id: string;
  type: string;
  role: string;
  content: string | null;
  telegram_update_id: string | null;
}

function rowToMessage(row: RawMessageRow): Message {
  return {
    id: Number(row.id),
    created_at: row.created_at,
    telegram_username: row.telegram_username,
    thread_id: Number(row.thread_id),
    type: row.type as MessageType,
    role: row.role as MessageRole,
    content: row.content,
    telegram_update_id: row.telegram_update_id != null ? Number(row.telegram_update_id) : null,
  };
}
