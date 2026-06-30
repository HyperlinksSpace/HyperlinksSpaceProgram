import type { ThemeName } from "../../theme";
import { colorForAvatarLetter } from "./chatAvatarInitials";
import { resolveTelegramUserAccentColor } from "./resolveTelegramUserAccentColor";

function senderSeed(senderUserId: number | null, senderChatId: number | null, senderName: string): string {
  if (senderUserId != null) return `u:${senderUserId}`;
  if (senderChatId != null) return `c:${senderChatId}`;
  return `n:${senderName.trim().toLowerCase()}`;
}

/** Distinct username color per sender — profile accent when set, else Telegram-style hash. */
export function groupSenderDisplayColor(
  senderUserId: number | null,
  senderChatId: number | null,
  senderName: string,
  scheme: ThemeName,
  accentLight?: string | null,
  accentDark?: string | null,
): string {
  const profileColor = resolveTelegramUserAccentColor(accentLight, accentDark, scheme);
  if (profileColor) return profileColor;
  const seed = senderSeed(senderUserId, senderChatId, senderName);
  const letter = Array.from(seed).find((ch) => /[a-z0-9]/i.test(ch)) ?? "A";
  return colorForAvatarLetter(letter, scheme);
}
