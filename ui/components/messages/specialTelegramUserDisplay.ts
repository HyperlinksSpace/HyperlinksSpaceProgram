/** Telegram user id for Irina (private chat title "Irina", peer_user_id from TDLib). */
export const IRINA_TELEGRAM_USER_ID = 402111770;
/** Telegram user id for MMI (private chat title "MMI"). */
export const MMI_TELEGRAM_USER_ID = 217908042;
/** Telegram user id for Мама (private chat title "Мама"). */
export const MAMA_TELEGRAM_USER_ID = 7243866484;
/** Telegram user id for Алексей (private chat title "Алексей"). */
export const ALEXEY_TELEGRAM_USER_ID = 1843695608;
/** Telegram user id for Наталья Лавренова (private chat title with «Искусству быть!»). */
export const NATALYA_LAVRENOVA_TELEGRAM_USER_ID = 86649762;

export const SPECIAL_USER_BADGE_GAP_PX = 5;
export const SPECIAL_USER_BADGE_SIZE_PX = 20;

export type SpecialUserBadgeKind = "cross" | "status_tgs" | "peace_sign" | "mona_lisa";

type SpecialUserRule = {
  displayName?: string;
  shine: boolean;
  badge: SpecialUserBadgeKind;
};

const SPECIAL_USER_RULES: Record<number, SpecialUserRule> = {
  [IRINA_TELEGRAM_USER_ID]: { shine: true, badge: "cross" },
  [MMI_TELEGRAM_USER_ID]: { displayName: "Petr Ignatyev", shine: true, badge: "status_tgs" },
  [MAMA_TELEGRAM_USER_ID]: { displayName: "Olga Valentinovna", shine: true, badge: "status_tgs" },
  [ALEXEY_TELEGRAM_USER_ID]: { displayName: "Alexey Ignatyev", shine: true, badge: "peace_sign" },
  [NATALYA_LAVRENOVA_TELEGRAM_USER_ID]: { shine: true, badge: "mona_lisa" },
};

export function specialUserRule(telegramUserId: number | null | undefined): SpecialUserRule | null {
  if (telegramUserId == null || !Number.isFinite(telegramUserId)) return null;
  return SPECIAL_USER_RULES[telegramUserId] ?? null;
}

export function specialUserDisplayName(
  telegramUserId: number | null | undefined,
  fallbackName: string,
): string {
  const override = specialUserRule(telegramUserId)?.displayName;
  if (override?.trim()) return override.trim();
  return fallbackName.trim();
}

export function specialUserShowsShineName(telegramUserId: number | null | undefined): boolean {
  return specialUserRule(telegramUserId)?.shine ?? false;
}

export function specialUserBadgeKind(
  telegramUserId: number | null | undefined,
): SpecialUserBadgeKind | null {
  return specialUserRule(telegramUserId)?.badge ?? null;
}

/** @deprecated Use specialUserBadgeKind / specialUserBadgeExtraWidthPx. */
export function specialUserShowsCrossBadge(telegramUserId: number | null | undefined): boolean {
  return specialUserBadgeKind(telegramUserId) === "cross";
}

export function specialUserBadgeExtraWidthPx(telegramUserId: number | null | undefined): number {
  if (!specialUserBadgeKind(telegramUserId)) return 0;
  return SPECIAL_USER_BADGE_GAP_PX + SPECIAL_USER_BADGE_SIZE_PX;
}

/** @deprecated Use specialUserBadgeExtraWidthPx. */
export function specialUserCrossBadgeExtraWidthPx(telegramUserId: number | null | undefined): number {
  return specialUserBadgeExtraWidthPx(telegramUserId);
}
