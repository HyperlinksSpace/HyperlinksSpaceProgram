import {
  getThemeColorsFromLaunchThemeParams,
  getThemeColorsFromTelegramCssVars,
  getThemeColorsFromWebAppThemeParams,
} from "./components/telegramWebApp";

export const dark = {
  background: "#000000",
  primary: "#FFFFFF",
  /** Muted UI / hints — same as `highlight` (not hard-coded #818181 / Telegram `hint_color`). */
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
  return dark;
}

/** Same on SSR and first client paint — never app dark (#111); Telegram bg shows through CSS vars. */
const TELEGRAM_PRE_READY_FALLBACK: ThemeColors = {
  ...dark,
  background: "transparent",
};

export function useColors(): ThemeColors {
  // Lazy require so importers of only `dark` / `light` do not load the TMA / Telegram module graph.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
  const { useTelegram } = require("./components/Telegram") as {
    useTelegram: () => {
      colorScheme: ThemeName;
      isInTelegram: boolean;
      useTelegramTheme: boolean;
      themeBgReady: boolean;
      clientHydrated: boolean;
    };
  };
  const { colorScheme, useTelegramTheme, themeBgReady, clientHydrated } = useTelegram();

  // SSR has no `window`, so `useTelegramTheme` is false and we use `dark`. On the client, TMA would
  // otherwise take the branch below with `transparent` before `clientHydrated` — different from
  // server HTML and triggers React #418 on web (e.g. index bootstrap `backgroundColor`).
  if (!clientHydrated) {
    return getColorsForTheme("dark");
  }

  if (useTelegramTheme && !themeBgReady) {
    const preReady =
      getThemeColorsFromTelegramCssVars() ??
      getThemeColorsFromWebAppThemeParams() ??
      getThemeColorsFromLaunchThemeParams();
    if (preReady) {
      return { ...dark, ...preReady, highlight: dark.highlight, secondary: dark.secondary };
    }
    return TELEGRAM_PRE_READY_FALLBACK;
  }

  const themeName: ThemeName =
    !useTelegramTheme ? "dark" : themeBgReady ? colorScheme : "dark";

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
