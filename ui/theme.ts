import { Platform, type TextStyle } from "react-native";
import { FONT_UI_SANS_SEMIBOLD, WEB_UI_MONO_STACK } from "./fonts";
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

/** Home wide strip / stroke-driven glyphs: `primary` vs `highlight` theme colors. */
export type MenuIconVariant = "primary" | "highlight";

export function menuIconStrokeColor(colors: ThemeColors, variant: MenuIconVariant): string {
  return variant === "primary" ? colors.primary : colors.highlight;
}

/** `assets/menu/*.svg` viewBox. */
export const MENU_ICON_DEFAULT_SIZE = 30;

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
  /**
   * Authenticated home (`/` signed-in): padding inside the root scroll column (same outer scroll as welcome).
   * Central place to tune per breakpoint/platform later (e.g. `Platform.select` or responsive hook).
   */
  authenticatedHome: {
    contentInsetTop: 22,
    contentInsetBottom: 22,
    contentInsetHorizontal: 15,
    /** Horizontal gap between truncated address and the header icon cluster. */
    addressRowGap: 15,
    /** Gap between adjacent icons from `assets/header/*.svg`. */
    headerIconGap: 15,
    /** Tap/visual size for header icons (`assets/header/*.svg` viewBoxes are 30×30). */
    headerIconDisplaySize: 30,
    /** Show extra middle column (Get/Swap/Deals/Trade/Send) when viewport width is greater than this. */
    wideMenuBreakpoint: 724,
    /** Each wide-menu cell flexes between min and max width (px). */
    wideMenuItemMinWidth: 50,
    wideMenuItemMaxWidth: 100,
    /** Space between icon and label under it (px). */
    wideMenuIconLabelGap: 10,
  },
  /** FloatingShield glass discs — diameters match original `settingsCircle` / `circle` (dp). */
  floatingShield: {
    settingsDiameter: 30,
    shieldDiameter: 50,
  },
  bottomBar: {
    barMinHeight: 59,
    lineHeight: 20,
    verticalPadding: 20,
    applyIconBottom: 25,
    maxLinesBeforeScroll: 7,
    maxBarHeight: 190,
    horizontalPadding: 15,
    /** Custom 1px scroll-thumb columns (main web column + bottom bar); separate from `horizontalPadding`. */
    scrollbarRightInsetPx: 5,
  },
};

export const icons = {
  apply: {
    width: 15,
    height: 10,
  },
};

/**
 * Single optical vertical shift for Noto Sans (px). Tune here only.
 *
 * RN `Text` / `TextInput` pick this up via `ensureUiSansFontFamilyDefaults()` as
 * `uiTextVerticalCompensationTransform`. For plain DOM (e.g. web `textarea`) use
 * `translateY(${uiTextVerticalCompensationY}px)`. Icons beside that text use the smaller
 * **`uiIconButtonVerticalCompensationTransform`** (see `uiIconButtonVerticalCompensationY`). Do **not**
 * put `uiTextVerticalCompensationTransform` on `TextStyle` tokens like `typographyRect15` — that would
 * double-apply on `Text`.
 */
export const uiTextVerticalCompensationY = Platform.OS === "web" ? -2 : -1;

export const uiTextVerticalCompensationTransform = {
  transform: [{ translateY: uiTextVerticalCompensationY }],
} satisfies Pick<TextStyle, "transform">;

/** Icons in buttons: upward correction magnitude (px). RN uses negative `translateY`. */
export const uiIconButtonVerticalCompensationPx = 1;

export const uiIconButtonVerticalCompensationY = -uiIconButtonVerticalCompensationPx;

export const uiIconButtonVerticalCompensationTransform = {
  transform: [{ translateY: uiIconButtonVerticalCompensationY }],
} satisfies Pick<TextStyle, "transform">;

/** Welcome OAuth buttons only: Apple asset sits low — extra upward correction (px). */
export const uiWelcomeAppleOAuthIconExtraCompensationPx = 1;

/**
 * Single-line labels in fixed-height rows (auth buttons, undercover strips, etc.).
 *
 * Pairs with global `uiTextVerticalCompensationY` on `Text`. `lineHeight` slightly above `fontSize`
 * avoids descender clipping; ~18px tracks Noto for 40px-tall rows without blowing up the line box.
 */
export const typographyRect15: TextStyle = {
  fontSize: 15,
  lineHeight: 18,
  fontWeight: "400",
  includeFontPadding: false,
  textAlignVertical: "center",
  paddingVertical: 0,
};

/** Wide home menu labels under SVG icons (15 / 15 — tight line box). */
export const homeWideMenuItemLabel: TextStyle = {
  fontSize: 15,
  lineHeight: 15,
  fontWeight: "400",
  textAlign: "center",
  includeFontPadding: false,
  paddingVertical: 0,
};

/** Noto Sans Semibold file — use **`fontWeight: "400"`** (RN separate families per weight). */
export const typographySansSemibold: TextStyle = {
  fontFamily: FONT_UI_SANS_SEMIBOLD,
  fontWeight: "400",
  includeFontPadding: false,
  textAlignVertical: "center",
  paddingVertical: 0,
};

/** Truncated wallet address row on authenticated home (`highlight` color from palette). */
export const homeWalletAddressHeaderText: TextStyle = {
  fontFamily: WEB_UI_MONO_STACK,
  fontSize: 15,
  /** ~24px line box pairs with 30px header icons; 30px looked visually low with Noto Mono. */
  lineHeight: 24,
  fontWeight: "400",
  includeFontPadding: false,
  paddingVertical: 0,
  textAlignVertical: "center",
};
