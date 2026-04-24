import {
  getThemeColorsFromLaunchThemeParams,
  getThemeColorsFromTelegramCssVars,
  getThemeColorsFromWebAppThemeParams,
} from "./components/telegramWebApp";

export const dark = {
  background: "#000000",
  primary: "#FFFFFF",
  /** Muted UI / hints — same family as `highlight` (not Telegram `hint_color` / #818181). */
  secondary: "#515151",
  highlight: "#515151",
  undercover: "#272727",
} as const;

export const light = {
  background: "#FFFFFF",
  primary: "#000000",
  secondary: "#AAAAAA",
  highlight: "#AAAAAA",
  undercover: "#F1F1F1",
} as const;

export type ThemeName = "dark" | "light";
export type ThemeColors = {
  background: string;
  primary: string;
  secondary: string;
  highlight: string;
  /** Filled surfaces / buttons (theme `undercover` in Dart palette). */
  undercover: string;
};

export function getColorsForTheme(name: ThemeName | undefined | null): ThemeColors {
  if (name === "light") return light;
  // Default + fallback: dark
  return dark;
}

/** Same on SSR and first client paint — never app dark (#111); Telegram bg shows through CSS vars. */
const TELEGRAM_PRE_READY_FALLBACK: ThemeColors = {
  ...dark,
  background: "transparent",
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
      // Do not let Telegram `hint_color` (`preReady.secondary`) paint app chrome as #818181.
      return { ...dark, ...preReady, highlight: dark.highlight, secondary: dark.secondary };
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

