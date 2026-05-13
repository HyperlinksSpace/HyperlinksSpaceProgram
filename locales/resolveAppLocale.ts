import type { AppLocale } from "./appStrings";
import { APP_LOCALE_DEFAULT } from "./appStrings";

export type AppLocaleResolutionReason =
  | "not_telegram_mini_app"
  | "mini_app_missing_language_code"
  | "telegram_language_ru"
  | "telegram_language_other_to_en";

export type AppLocaleResolutionMeta = {
  locale: AppLocale;
  reason: AppLocaleResolutionReason;
  /** Lowercase base tag from `telegramLanguageCode` when present (e.g. `ru`, `en`). */
  languageBase: string | null;
};

function languageTagToAppLocale(tag: string): AppLocale {
  const base = tag.split(/[-_]/)[0]?.toLowerCase() ?? "";
  if (base === "ru") return "ru";
  return "en";
}

/**
 * UI locale policy:
 * - **Inside the Telegram Mini App** (`telegramMiniApp`): use Telegram `user.language_code` from
 *   WebApp init data — Russian (`ru` base tag) → Russian UI; any other language → English.
 * - **Outside the Mini App** (normal web, OIDC browser session, dev): always English.
 *
 * We intentionally do **not** use `navigator.language` so browser/OS locale does not override this.
 */
export function resolveAppLocaleWithMeta(opts: {
  telegramMiniApp: boolean;
  telegramLanguageCode: string | null | undefined;
}): AppLocaleResolutionMeta {
  if (!opts.telegramMiniApp) {
    return { locale: APP_LOCALE_DEFAULT, reason: "not_telegram_mini_app", languageBase: null };
  }
  const raw = typeof opts.telegramLanguageCode === "string" ? opts.telegramLanguageCode.trim() : "";
  if (!raw) {
    return {
      locale: APP_LOCALE_DEFAULT,
      reason: "mini_app_missing_language_code",
      languageBase: null,
    };
  }
  const base = raw.split(/[-_]/)[0]?.toLowerCase() ?? "";
  if (base === "ru") {
    return { locale: "ru", reason: "telegram_language_ru", languageBase: base };
  }
  return { locale: "en", reason: "telegram_language_other_to_en", languageBase: base || null };
}

export function resolveAppLocale(opts: {
  telegramMiniApp: boolean;
  telegramLanguageCode: string | null | undefined;
}): AppLocale {
  return resolveAppLocaleWithMeta(opts).locale;
}
