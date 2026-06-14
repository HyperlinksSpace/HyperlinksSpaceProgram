import { useWindowDimensions } from "react-native";

import {
  isAuthenticatedHomeWideLayoutWidthPx,
  readAuthenticatedHomeLayoutWidthPx,
} from "../authenticatedHomeLayoutWidth";
import { useAuthenticatedHomeSplitLayoutMetrics } from "../components/AuthenticatedHomeSplitLayoutMetricsContext";
import { useTelegram } from "../components/Telegram";

export function useChooseCurrencyLayoutWide(): boolean {
  const splitMetrics = useAuthenticatedHomeSplitLayoutMetrics();
  const { width: windowWidth } = useWindowDimensions();
  const fallbackWidthPx = readAuthenticatedHomeLayoutWidthPx(windowWidth);
  if (splitMetrics) {
    return splitMetrics.columnCount >= 2;
  }
  return isAuthenticatedHomeWideLayoutWidthPx(fallbackWidthPx);
}

/** Header / subheader / Telegram back rules for choose-currency (route + wide split panel). */
export function useChooseCurrencyChrome() {
  const { isInTelegram, layoutStartup } = useTelegram();
  const isWide = useChooseCurrencyLayoutWide();
  const isTmaDesktop = isInTelegram && layoutStartup.isTelegramMiniAppDesktop;
  const isTmaMobile = isInTelegram && !isTmaDesktop;

  /** Narrow `/swap/currency`: hide centered logo header for TMA desktop and browser compact. */
  const hideLogoHeader = isTmaDesktop || !isInTelegram;

  /** Subheader Back — browser and TMA desktop compact; TMA mobile uses native Telegram back. */
  const showSubheaderBack = !isInTelegram || (isTmaDesktop && !isWide);

  return {
    isWide,
    isTmaDesktop,
    isTmaMobile,
    hideLogoHeader,
    showSubheaderBack,
    useTelegramNativeBack: isTmaMobile,
    titleAlign:
      isTmaMobile || (isTmaDesktop && isWide) ? ("left" as const) : ("center" as const),
  };
}
