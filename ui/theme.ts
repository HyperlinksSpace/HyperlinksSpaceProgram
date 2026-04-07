import {
  getThemeColorsFromLaunchThemeParams,
  getThemeColorsFromTelegramCssVars,
  getThemeColorsFromWebAppThemeParams,
} from "./components/telegramWebApp";

const sharedColors = {
  secondary: "#818181",
} as const;

export const dark = {
  ...sharedColors,
  background: "#111111",
  primary: "#FAFAFA",
} as const;

export const light = {
  ...sharedColors,
  background: "#FAFAFA",
  primary: "#111111",
} as const;

export type ThemeName = "dark" | "light";
export type ThemeColors = {
  background: string;
  primary: string;
  secondary: string;
};

export function getColorsForTheme(name: ThemeName | undefined | null): ThemeColors {
  if (name === "light") return light;
  // Default + fallback: dark
  return dark;
}

/** Same on SSR and first client paint — never app dark (#111); Telegram bg shows through CSS vars. */
const TELEGRAM_PRE_READY_FALLBACK: ThemeColors = {
  background: "transparent",
  primary: "rgba(0,0,0,0.35)",
  secondary: "#818181",
};

// Convenience hook: derive palette when used in React, using Telegram theme in TMA
// and dark theme as default/fallback elsewhere.
export function useColors(): ThemeColors {
  // Lazy import to avoid a hard dependency when this is used outside React.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useTelegram } = require("./components/Telegram") as {
    useTelegram: () => {
      colorScheme: ThemeName;
      isInTelegram: boolean;
      useTelegramTheme: boolean;
      themeBgReady: boolean;
      clientHydrated: boolean;
    };
  };
  const { colorScheme, isInTelegram, useTelegramTheme, themeBgReady, clientHydrated } =
    useTelegram();

  // TMA before themeBgReady: never use app dark (#111). Until clientHydrated, match SSR exactly
  // (React #418 if server HTML used different colors / themeBgReady than first client render).
  if (useTelegramTheme && !themeBgReady) {
    if (!clientHydrated) {
      return TELEGRAM_PRE_READY_FALLBACK;
    }
    const preReady =
      getThemeColorsFromTelegramCssVars() ??
      getThemeColorsFromWebAppThemeParams() ??
      getThemeColorsFromLaunchThemeParams();
    if (preReady) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[useColors] telegram pre-ready palette", preReady);
      }
      return preReady;
    }
    return TELEGRAM_PRE_READY_FALLBACK;
  }

  // Plain web: default dark. TMA after themeBgReady: colorScheme from WebApp.
  const themeName: ThemeName =
    !useTelegramTheme ? "dark" : themeBgReady ? colorScheme : "dark";

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[useColors] resolved", {
      isInTelegram,
      useTelegramTheme,
      themeBgReady,
      colorScheme,
      themeName,
    });
  }

  return getColorsForTheme(themeName);
}

export const layout = {
  maxContentWidth: 600,
  bottomBar: {
    barMinHeight: 59,
    lineHeight: 20,
    verticalPadding: 20,
    applyIconBottom: 25,
    maxLinesBeforeScroll: 7,
    maxBarHeight: 190,
    horizontalPadding: 15,
  },
};

export const icons = {
  apply: {
    width: 15,
    height: 10,
  },
};

