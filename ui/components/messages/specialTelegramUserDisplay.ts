export {
  ALEXEY_TELEGRAM_USER_ID,
  IRINA_TELEGRAM_USER_ID,
  MAMA_TELEGRAM_USER_ID,
  MMI_TELEGRAM_USER_ID,
  NATALYA_LAVRENOVA_TELEGRAM_USER_ID,
  SPECIAL_USER_BADGE_GAP_PX,
  SPECIAL_USER_BADGE_SIZE_PX,
  specialUserBadgeExtraWidthPx,
  specialUserBadgeKind,
  specialUserDisplayName,
  specialUserRule,
  specialUserShowsShineName,
  type SpecialUserBadgeKind,
} from "../../../shared/specialTelegramUsers.js";

import { specialUserBadgeExtraWidthPx, specialUserBadgeKind } from "../../../shared/specialTelegramUsers.js";

/** @deprecated Use specialUserBadgeKind / specialUserBadgeExtraWidthPx. */
export function specialUserShowsCrossBadge(
  telegramUserId: number | null | undefined,
  fallbackName = "",
): boolean {
  return specialUserBadgeKind(telegramUserId, fallbackName) === "cross";
}

/** @deprecated Use specialUserBadgeExtraWidthPx. */
export function specialUserCrossBadgeExtraWidthPx(
  telegramUserId: number | null | undefined,
  fallbackName = "",
): number {
  return specialUserBadgeExtraWidthPx(telegramUserId, fallbackName);
}
