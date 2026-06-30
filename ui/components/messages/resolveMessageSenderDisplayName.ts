import { resolveTelegramDisplayName } from "../../../shared/telegramDisplayName";
import { specialUserDisplayName } from "./specialTelegramUserDisplay";

/** Visible sender label for group message bubbles (handles invisible-name tricks). */
export function resolveMessageSenderDisplayName(
  senderName: string,
  senderUserId: number | null | undefined,
  telegramChatId?: number | null,
): string {
  const special = specialUserDisplayName(senderUserId, senderName, telegramChatId);
  return resolveTelegramDisplayName({
    name: special,
    userId: senderUserId,
  });
}
