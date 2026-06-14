import { useRouter } from "expo-router";
import { useCallback } from "react";

import { useTelegram } from "../components/Telegram";
import { isAppHomePathname, navigateBackOrHome } from "../navigateBackOrHome";
import { closeSwapCurrencyPicker } from "../swap/swapCurrencyPicker";
import { useTelegramWebAppBackButton } from "./useTelegramWebAppBackButton";

/** TMA mobile: swap Telegram's close control for native back on authenticated sub-routes. */
export function useTmaMobileNativeBackNavigation(
  pathname: string | null | undefined,
  isAuthenticated: boolean,
) {
  const router = useRouter();
  const { isInTelegram, layoutStartup } = useTelegram();
  const isTmaMobile = isInTelegram && !layoutStartup.isTelegramMiniAppDesktop;
  const enabled =
    isTmaMobile && isAuthenticated && !isAppHomePathname(pathname) && pathname !== "/welcome";

  const onBack = useCallback(() => {
    if (pathname === "/swap/currency") {
      closeSwapCurrencyPicker();
    }
    navigateBackOrHome(router);
  }, [pathname, router]);

  useTelegramWebAppBackButton(onBack, enabled);
}
