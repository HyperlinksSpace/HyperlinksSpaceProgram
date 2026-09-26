import type { Client } from "tdl";
import {
  isPrivateTdChat,
  peerUserIdFromChat,
  type TdChat,
} from "./chatPreview.js";
import { isDeletedTdUser } from "./tdUserProfile.js";
import { loadBlockedUserIdSet } from "./userProfile.js";

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** True when this private peer must not appear in the main chat list. */
export async function isHiddenPrivatePeer(
  client: Client,
  userId: number,
  blockedIds?: ReadonlySet<number>,
): Promise<boolean> {
  if (!Number.isFinite(userId) || userId <= 0) return false;
  const blocked = blockedIds ?? (await loadBlockedUserIdSet(client));
  if (blocked.has(Math.trunc(userId))) return true;
  try {
    const user = await client.invoke({ _: "getUser", user_id: Math.trunc(userId) });
    return isDeletedTdUser(user);
  } catch {
    return false;
  }
}

/**
 * Drop private dialogs for blocked or deleted accounts.
 * Matches product intent: those rows should not appear in the visible chat list
 * (stricter than stock Desktop, which still shows some “Deleted Account” dialogs).
 */
export async function omitHiddenPrivateChats(
  client: Client,
  chats: TdChat[],
): Promise<TdChat[]> {
  if (chats.length === 0) return chats;
  const blocked = await loadBlockedUserIdSet(client);
  const peerIds = new Set<number>();
  for (const chat of chats) {
    if (!isPrivateTdChat(chat)) continue;
    const peerId = peerUserIdFromChat(chat);
    if (peerId != null && peerId > 0) peerIds.add(peerId);
  }
  const deleted = new Set<number>();
  await mapWithConcurrency([...peerIds], 8, async (userId) => {
    if (blocked.has(userId)) return;
    try {
      const user = await client.invoke({ _: "getUser", user_id: userId });
      if (isDeletedTdUser(user)) deleted.add(userId);
    } catch {
      /* keep chat if getUser fails */
    }
  });
  if (blocked.size === 0 && deleted.size === 0) return chats;
  return chats.filter((chat) => {
    if (!isPrivateTdChat(chat)) return true;
    const peerId = peerUserIdFromChat(chat);
    if (peerId == null) return true;
    if (blocked.has(peerId)) return false;
    if (deleted.has(peerId)) return false;
    return true;
  });
}
