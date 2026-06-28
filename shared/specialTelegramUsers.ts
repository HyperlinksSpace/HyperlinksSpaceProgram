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
/** Telegram user id for @anriltine (Vsevolod Ignatyev). */
export const ANRILTINE_TELEGRAM_USER_ID = 7221481736;

export const SPECIAL_USER_BADGE_GAP_PX = 5;
export const SPECIAL_USER_BADGE_SIZE_PX = 20;

export type SpecialUserBadgeKind = "cross" | "status_tgs" | "peace_sign" | "art_sign" | "russian_flag" | "s_sign";

type SpecialUserRule = {
  displayName?: string;
  shine: boolean;
  badge: SpecialUserBadgeKind;
};

const ANDREY_DISPLAY_RULE: SpecialUserRule = {
  displayName: "Andrey Gennagevech",
  shine: true,
  badge: "russian_flag",
};

const SPECIAL_USER_RULES: Record<number, SpecialUserRule> = {
  [IRINA_TELEGRAM_USER_ID]: { shine: true, badge: "cross" },
  [MMI_TELEGRAM_USER_ID]: { displayName: "Petr Ignatyev", shine: true, badge: "status_tgs" },
  [MAMA_TELEGRAM_USER_ID]: { displayName: "Olga Valentinovna", shine: true, badge: "status_tgs" },
  [ALEXEY_TELEGRAM_USER_ID]: { displayName: "Alexey Ignatyev", shine: true, badge: "peace_sign" },
  [NATALYA_LAVRENOVA_TELEGRAM_USER_ID]: { shine: true, badge: "art_sign" },
  [ANRILTINE_TELEGRAM_USER_ID]: { shine: true, badge: "s_sign" },
};

/** Contact-name queries used during TDLib sync to surface hidden/blocked private chats. */
export const SUPPLEMENTARY_CONTACT_SEARCH_QUERIES = [
  "Андрей",
  "Andrey",
  "Gennadyevich",
  "Gennagevech",
  "Gennad",
] as const;

function specialUserRuleByDisplayName(displayName: string): SpecialUserRule | null {
  const normalized = displayName.trim().toLowerCase();
  if (!normalized) return null;
  if (/андрей|andrey/.test(normalized) && /genn|генн/.test(normalized)) {
    return ANDREY_DISPLAY_RULE;
  }
  return null;
}

export function resolveSpecialUserRule(
  telegramUserId: number | null | undefined,
  displayName: string,
): SpecialUserRule | null {
  const byId = specialUserRule(telegramUserId);
  if (byId) return byId;
  return specialUserRuleByDisplayName(displayName);
}

export function specialUserRule(telegramUserId: number | null | undefined): SpecialUserRule | null {
  if (telegramUserId == null || !Number.isFinite(telegramUserId) || telegramUserId <= 0) return null;
  return SPECIAL_USER_RULES[telegramUserId] ?? null;
}

export function specialUserDisplayName(
  telegramUserId: number | null | undefined,
  fallbackName: string,
): string {
  const override = resolveSpecialUserRule(telegramUserId, fallbackName)?.displayName;
  if (override?.trim()) return override.trim();
  return fallbackName.trim();
}

export function specialUserShowsShineName(
  telegramUserId: number | null | undefined,
  fallbackName = "",
): boolean {
  return resolveSpecialUserRule(telegramUserId, fallbackName)?.shine ?? false;
}

export function specialUserBadgeKind(
  telegramUserId: number | null | undefined,
  fallbackName = "",
): SpecialUserBadgeKind | null {
  return resolveSpecialUserRule(telegramUserId, fallbackName)?.badge ?? null;
}

export function specialUserBadgeExtraWidthPx(
  telegramUserId: number | null | undefined,
  fallbackName = "",
): number {
  if (!specialUserBadgeKind(telegramUserId, fallbackName)) return 0;
  return SPECIAL_USER_BADGE_GAP_PX + SPECIAL_USER_BADGE_SIZE_PX;
}

/** Peer user ids that must stay in the chat list even when absent from TDLib main list. */
export function specialUserForceIncludedPeerUserIds(): number[] {
  return Object.keys(SPECIAL_USER_RULES)
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
}
