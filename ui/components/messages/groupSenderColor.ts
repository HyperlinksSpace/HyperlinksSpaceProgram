import type { ThemeName } from "../../theme";
import { colorForAvatarLetter } from "./chatAvatarInitials";

function senderSeed(senderUserId: number | null, senderChatId: number | null, senderName: string): string {
  if (senderUserId != null) return `u:${senderUserId}`;
  if (senderChatId != null) return `c:${senderChatId}`;
  return `n:${senderName.trim().toLowerCase()}`;
}

/** Distinct username color per sender in group chats (Telegram-style). */
export function groupSenderDisplayColor(
  senderUserId: number | null,
  senderChatId: number | null,
  senderName: string,
  scheme: ThemeName,
): string {
  const seed = senderSeed(senderUserId, senderChatId, senderName);
  const letter = Array.from(seed).find((ch) => /[a-z0-9]/i.test(ch)) ?? "A";
  return colorForAvatarLetter(letter, scheme);
}
