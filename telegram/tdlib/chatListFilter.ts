import { specialUserForceIncludedPeerUserIds } from "../../shared/specialTelegramUsers.js";
import {
  isChatInArchiveList,
  isChatInFolderList,
  isChatInMainList,
  isChatPinnedInMainList,
  isPrivateTdChat,
  peerUserIdFromChat,
  type TdChat,
} from "./chatPreview.js";

export type ChatListTier = "pinned" | "positioned" | "unpositioned" | "excluded";

export type ChatListFilterOptions = {
  allowSupplementaryPrivate?: boolean;
  /** TDLib getMe id — Saved Messages (self) stays in the roster even without a list position. */
  selfUserId?: number | null;
};

/** Classify a TDLib chat into list tiers (pinned → positioned → unpositioned tail). */
export function chatListTier(
  chat: TdChat,
  options?: ChatListFilterOptions,
): ChatListTier {
  if (isChatPinnedInMainList(chat)) return "pinned";
  // Main, archive, and folder-only chats belong in the flat list.
  if (isChatInMainList(chat) || isChatInArchiveList(chat) || isChatInFolderList(chat)) {
    return "positioned";
  }
  const peerUserId = peerUserIdFromChat(chat);
  const selfUserId = options?.selfUserId;
  if (
    peerUserId != null &&
    selfUserId != null &&
    Number.isFinite(selfUserId) &&
    selfUserId > 0 &&
    peerUserId === Math.trunc(selfUserId)
  ) {
    return "unpositioned";
  }
  if (peerUserId != null && specialUserForceIncludedPeerUserIds().includes(peerUserId)) {
    return "unpositioned";
  }
  if (options?.allowSupplementaryPrivate && isPrivateTdChat(chat) && peerUserId != null) {
    return "unpositioned";
  }
  return "excluded";
}

export type ShouldIncludeChatOptions = ChatListFilterOptions & {
  /** When false, skip supplementary / forced private chats in the unpositioned tier. */
  includeUnpositioned?: boolean;
};

export function shouldIncludeChatInList(
  chat: TdChat,
  options?: ShouldIncludeChatOptions,
): boolean {
  const tier = chatListTier(chat, { allowSupplementaryPrivate: true, ...options });
  if (tier === "pinned" || tier === "positioned") return true;
  if (tier === "unpositioned") {
    if (options?.includeUnpositioned !== false) return true;
    // Special force-included peers + Saved Messages stay even when supplementary search is off.
    const peerUserId = peerUserIdFromChat(chat);
    if (peerUserId != null && specialUserForceIncludedPeerUserIds().includes(peerUserId)) {
      return true;
    }
    const selfUserId = options?.selfUserId;
    return (
      peerUserId != null &&
      selfUserId != null &&
      Number.isFinite(selfUserId) &&
      selfUserId > 0 &&
      peerUserId === Math.trunc(selfUserId)
    );
  }
  return false;
}

export function filterChatsForList(
  chats: TdChat[],
  options?: ShouldIncludeChatOptions,
): TdChat[] {
  return chats.filter((chat) => shouldIncludeChatInList(chat, options));
}
