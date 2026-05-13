import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  getInitDataString,
  getPlatform,
  getTmaInitAndWebAppDebugSnapshot,
  getUser,
  isTelegramMiniAppEnvironment,
} from "../ui/components/telegramWebApp";
import { useTelegram } from "../ui/components/Telegram";
import { logPageDisplay } from "../ui/pageDisplayLog";
import {
  type AppLocale,
  type AppStringKey,
  formatAppString,
  getAppString,
  translateFlowErrorForDisplay,
} from "./appStrings";
import { resolveAppLocale, resolveAppLocaleWithMeta } from "./resolveAppLocale";

export type AppStringsContextValue = {
  locale: AppLocale;
  t: (key: AppStringKey) => string;
  tf: (key: AppStringKey, vars?: Record<string, string | number | boolean>) => string;
  /** Map known English wallet-flow errors to the current locale. */
  translateFlowError: (message: string) => string;
};

const AppStringsContext = createContext<AppStringsContextValue | null>(null);

export function AppStringsProvider({ children }: { children: ReactNode }) {
  const { initData, isInTelegram, status, debug } = useTelegram();

  const locale = useMemo(() => {
    const u = getUser();
    const rawLc =
      u && typeof u === "object" && u !== null && "language_code" in u
        ? (u as Record<string, unknown>).language_code
        : undefined;
    const lc = typeof rawLc === "string" ? rawLc : null;
    return resolveAppLocale({ telegramMiniApp: isInTelegram, telegramLanguageCode: lc });
  }, [isInTelegram, status, initData]);

  useEffect(() => {
    const u = getUser();
    const rawLc =
      u && typeof u === "object" && u !== null && "language_code" in u
        ? (u as Record<string, unknown>).language_code
        : undefined;
    const telegramLanguageCode = typeof rawLc === "string" ? rawLc : null;
    const meta = resolveAppLocaleWithMeta({
      telegramMiniApp: isInTelegram,
      telegramLanguageCode,
    });
    const app =
      typeof window !== "undefined"
        ? (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: unknown } } } })
            .Telegram?.WebApp
        : undefined;
    const unsafeUser = app?.initDataUnsafe?.user;
    const initDataUnsafeUserKeys =
      unsafeUser != null && typeof unsafeUser === "object" && !Array.isArray(unsafeUser)
        ? Object.keys(unsafeUser as object).sort()
        : [];

    logPageDisplay("app_locale_resolution", {
      resolvedLocale: meta.locale,
      resolutionReason: meta.reason,
      languageBase: meta.languageBase,
      telegramLanguageCodeFromGetUser: telegramLanguageCode,
      userId: u?.id ?? null,
      isInTelegram,
      status,
      initDataCharsFromContext: typeof initData === "string" ? initData.length : 0,
      initDataCharsFromWebApp: getInitDataString()?.length ?? 0,
      webAppPlatform: getPlatform(),
      initDataUnsafeUserKeys,
      debugHasWebAppApi: debug.hasWebAppApi,
      debugInTelegramClient: debug.inTelegramClient,
      debugInitDataLength: debug.initDataLength,
      isTelegramMiniAppEnvironment: isTelegramMiniAppEnvironment(),
      tmaLaunchSnapshot: getTmaInitAndWebAppDebugSnapshot(),
    });
  }, [
    locale,
    isInTelegram,
    status,
    initData,
    debug.hasWebAppApi,
    debug.inTelegramClient,
    debug.initDataLength,
  ]);

  const t = useCallback((key: AppStringKey) => getAppString(locale, key), [locale]);

  const tf = useCallback(
    (key: AppStringKey, vars?: Record<string, string | number | boolean>) =>
      formatAppString(locale, key, vars),
    [locale],
  );

  const translateFlowError = useCallback(
    (message: string) => translateFlowErrorForDisplay(locale, message),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, t, tf, translateFlowError }),
    [locale, t, tf, translateFlowError],
  );

  return <AppStringsContext.Provider value={value}>{children}</AppStringsContext.Provider>;
}

export function useAppStrings(): AppStringsContextValue {
  const ctx = useContext(AppStringsContext);
  if (!ctx) {
    throw new Error("useAppStrings must be used within AppStringsProvider");
  }
  return ctx;
}

/** Safe for optional tooling / stories without provider (defaults to English). */
export function useAppStringsOptional(): AppStringsContextValue | null {
  return useContext(AppStringsContext);
}
