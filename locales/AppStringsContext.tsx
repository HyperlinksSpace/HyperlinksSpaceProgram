import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
import { readStoredManualAppLocale, writeStoredManualAppLocale } from "./manualAppLocaleStorage";
import {
  readStoredWelcomeFeedManualTranslation,
  writeStoredWelcomeFeedManualTranslation,
} from "./manualWelcomeFeedTranslationStorage";
import { resolveAppLocale, resolveAppLocaleWithMeta } from "./resolveAppLocale";
import {
  type FeedCatalogLocale,
  resolveWelcomeFeedDisplayLocale,
} from "./resolveFeedCatalogLocale";

export type AppStringsContextValue = {
  /** Effective UI locale (manual override or Telegram-derived). */
  locale: AppLocale;
  /** Locale from Telegram init / policy only (no manual override). */
  autoLocale: AppLocale;
  /** User override from header toggle; `null` = follow {@link autoLocale}. */
  manualLocale: AppLocale | null;
  /** Glyph shown on the header language chip: language you switch *to* when tapped. */
  headerLanguageToggleShows: "en" | "ru";
  t: (key: AppStringKey) => string;
  tf: (key: AppStringKey, vars?: Record<string, string | number | boolean>) => string;
  /** Map known English wallet-flow errors to the current locale. */
  translateFlowError: (message: string) => string;
  /** Toggle EN ↔ RU; clears override when the new choice matches {@link autoLocale}. */
  toggleUiLanguage: () => void;
  /** When true, welcome feed catalogue locale follows {@link locale}; when false, Telegram language rules. */
  welcomeFeedManualTranslation: boolean;
  setWelcomeFeedManualTranslation: (enabled: boolean) => void;
  /** Resolved catalogue locale for welcome-bundle feed copy (`feed_default_messages`). */
  welcomeFeedCatalogLocale: FeedCatalogLocale;
};

const AppStringsContext = createContext<AppStringsContextValue | null>(null);

export function AppStringsProvider({ children }: { children: ReactNode }) {
  const { initData, isInTelegram, status, debug } = useTelegram();

  const autoLocale = useMemo(() => {
    const u = getUser();
    const rawLc =
      u && typeof u === "object" && u !== null && "language_code" in u
        ? (u as Record<string, unknown>).language_code
        : undefined;
    const lc = typeof rawLc === "string" ? rawLc : null;
    return resolveAppLocale({ telegramMiniApp: isInTelegram, telegramLanguageCode: lc });
  }, [isInTelegram, status, initData]);

  const [manualLocale, setManualLocale] = useState<AppLocale | null>(() => readStoredManualAppLocale());
  const [welcomeFeedManualTranslation, setWelcomeFeedManualTranslation] = useState(() =>
    readStoredWelcomeFeedManualTranslation(),
  );

  useEffect(() => {
    writeStoredManualAppLocale(manualLocale);
  }, [manualLocale]);

  useEffect(() => {
    writeStoredWelcomeFeedManualTranslation(welcomeFeedManualTranslation);
  }, [welcomeFeedManualTranslation]);

  const locale = manualLocale ?? autoLocale;

  const welcomeFeedCatalogLocale = useMemo((): FeedCatalogLocale => {
    const u = getUser();
    const rawLc =
      u && typeof u === "object" && u !== null && "language_code" in u
        ? (u as Record<string, unknown>).language_code
        : undefined;
    const telegramLanguageCode = typeof rawLc === "string" ? rawLc : null;
    return resolveWelcomeFeedDisplayLocale({
      telegramLanguageCode,
      uiLocale: locale,
      manualWelcomeTranslationEnabled: welcomeFeedManualTranslation,
    });
  }, [locale, welcomeFeedManualTranslation, isInTelegram, status, initData]);

  const toggleUiLanguage = useCallback(() => {
    const effective = manualLocale ?? autoLocale;
    const next: AppLocale = effective === "ru" ? "en" : "ru";
    const newManual = next === autoLocale ? null : next;
    logPageDisplay("app_locale_manual_toggle", {
      effectiveBefore: effective,
      nextTapTargetLocale: next,
      autoLocale,
      manualAfter: newManual,
      clearedToFollowTelegram: newManual == null,
    });
    setManualLocale(newManual);
  }, [manualLocale, autoLocale]);

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
      effectiveLocale: locale,
      autoLocale,
      manualLocale,
      welcomeFeedManualTranslation,
      welcomeFeedCatalogLocale,
      resolvedFromTelegramMeta: meta,
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
    autoLocale,
    manualLocale,
    welcomeFeedManualTranslation,
    welcomeFeedCatalogLocale,
    isInTelegram,
    status,
    initData,
    debug.hasWebAppApi,
    debug.inTelegramClient,
    debug.initDataLength,
  ]);

  const headerLanguageToggleShows: "en" | "ru" = locale === "ru" ? "en" : "ru";

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
    () => ({
      locale,
      autoLocale,
      manualLocale,
      headerLanguageToggleShows,
      t,
      tf,
      translateFlowError,
      toggleUiLanguage,
      welcomeFeedManualTranslation,
      setWelcomeFeedManualTranslation,
      welcomeFeedCatalogLocale,
    }),
    [
      locale,
      autoLocale,
      manualLocale,
      headerLanguageToggleShows,
      t,
      tf,
      translateFlowError,
      toggleUiLanguage,
      welcomeFeedManualTranslation,
      welcomeFeedCatalogLocale,
    ],
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
