/** Telegram user id for Irina (private chat title "Irina", peer_user_id from TDLib). */
export const IRINA_TELEGRAM_USER_ID = 402111770;

export const SPECIAL_USER_CROSS_BADGE_GAP_PX = 5;
export const SPECIAL_USER_CROSS_BADGE_SIZE_PX = 20;

export function specialUserShowsCrossBadge(telegramUserId: number | null | undefined): boolean {
  return telegramUserId === IRINA_TELEGRAM_USER_ID;
}

export function specialUserShowsShineName(telegramUserId: number | null | undefined): boolean {
  return telegramUserId === IRINA_TELEGRAM_USER_ID;
}

/** Extra horizontal space occupied beside the name when the cross badge is shown. */
export function specialUserCrossBadgeExtraWidthPx(telegramUserId: number | null | undefined): number {
  if (!specialUserShowsCrossBadge(telegramUserId)) return 0;
  return SPECIAL_USER_CROSS_BADGE_GAP_PX + SPECIAL_USER_CROSS_BADGE_SIZE_PX;
}
