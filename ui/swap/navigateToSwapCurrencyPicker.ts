import type { Router } from "expo-router";

import { openAuthenticatedHomeRightPanel } from "../authenticatedHomeRightPanel";
import { focusAuthenticatedHomeMiddleColumnOnHeaderPanel } from "../authenticatedHomeSelectedChat";
import { readAuthenticatedHomeLayoutWidthPx, isAuthenticatedHomeWideLayoutWidthPx } from "../authenticatedHomeLayoutWidth";
import { openSwapCurrencyPicker, type SwapCurrencySide } from "./swapCurrencyPicker";

function isAuthenticatedHomePath(pathname: string | null | undefined): boolean {
  return pathname === "/" || pathname === "" || pathname == null;
}

export function navigateToSwapCurrencyPicker(
  router: Router,
  side: SwapCurrencySide,
  windowWidth: number,
  pathname?: string | null,
): void {
  if (isAuthenticatedHomeWideLayoutWidthPx(readAuthenticatedHomeLayoutWidthPx(windowWidth))) {
    openSwapCurrencyPicker(side);
    openAuthenticatedHomeRightPanel("swap");
    focusAuthenticatedHomeMiddleColumnOnHeaderPanel();
    if (!isAuthenticatedHomePath(pathname)) {
      router.replace("/");
    }
    return;
  }
  router.push({ pathname: "/swap/currency", params: { side } } as never);
}
