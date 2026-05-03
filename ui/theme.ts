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

/**
 * Authenticated home (`/` signed-in): first viewport width (px) where layout leaves the compact regime.
 * Compare as `width > firstBreakpoint` for wide header menu and other responsive pieces; add more breakpoints beside this.
 */
const authenticatedHomeFirstBreakpointPx = 724;
/** Authenticated home: viewport width (px) where a third split column appears (`width > secondBreakpoint`). */
const authenticatedHomeSecondBreakpointPx = 1280;

/** Horizontal inset from viewport or column inner edge to main content (not divider hit strips). */
const contentSideInsetPx = 15;

export const layout = {
  maxContentWidth: 600,
  contentSideInsetPx,
  /**
   * Authenticated home (`/` signed-in): padding inside the root scroll column (same outer scroll as welcome).
   * Central place to tune per breakpoint/platform later (e.g. `Platform.select` or responsive hook).
   */
  authenticatedHome: {
    contentInsetTop: 22,
    contentInsetBottom: 22,
    /**
     * Horizontal inset for header row and padded bodies. Same value as root `layout.contentSideInsetPx`; unrelated to split-pane divider hit width.
     */
    contentInsetHorizontal: contentSideInsetPx,
    /**
     * Outer `marginBottom` (px) on the authenticated-home header wrapper in
     * {@link HomeAuthenticatedHeaderRow}: vertical gap between the **bottom of the whole header block**
     * (content row **and** the optional full-bleed divider) and the **next** content in the scroll.
     * Does not affect tap targets or inner padding — only spacing below the header strip.
     */
    headerRowMarginBottom: 0,
    /**
     * Uniform expansion (px) of the **touch target** for header `Pressable`s (address row, icon cluster,
     * wide-menu items). React Native draws nothing here: bounds stay visually the same, but taps register
     * this far outside the visible bounds on each side — easier to hit small icons and text on touch devices.
     */
    headerPressableHitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
    /** Full-bleed divider stroke height (px) under the wide header row. */
    headerDividerHeight: 1,
    /** Character count taken from the end of the wallet string for the snippet (after `walletAddressSnippetPrefix`). */
    walletAddressSnippetTailLength: 8,
    /** Prefix before the visible wallet tail on the authenticated home header. */
    walletAddressSnippetPrefix: "..",
    /** Placeholder when the wallet address is empty (authenticated home header snippet). */
    walletAddressSnippetPlaceholder: "…",
    /** Inlined `assets/header/right.svg` width / height (px). */
    headerProfileChevronWidth: 5,
    headerProfileChevronHeight: 11,
    /** Matches `assets/header/right.svg` coordinate system with width/height above. */
    headerProfileChevronViewBox: "0 0 5 11",
    /** `zIndex` for the absolutely positioned wide-menu overlay above side columns. */
    wideMenuOverlayZIndex: 1,
    /** Horizontal gap between truncated address and the header icon cluster. */
    addressRowGap: 15,
    /** Gap between adjacent icons from `assets/header/*.svg`. */
    headerIconGap: 15,
    /** Tap/visual size for header icons (`assets/header/*.svg` viewBoxes are 30×30). */
    headerIconDisplaySize: 30,
    /** First authenticated-home layout breakpoint (px): wide menu and other elements use `viewportWidth > firstBreakpoint`. */
    firstBreakpoint: authenticatedHomeFirstBreakpointPx,
    /** Second layout breakpoint (px): three-column split body uses `rowWidth > secondBreakpoint` (with two draggable dividers). */
    secondBreakpoint: authenticatedHomeSecondBreakpointPx,
    /** Wide menu column width (px) at `wideMenuColumnExpandViewportMin` viewport width. */
    wideMenuColumnWidthMin: 50,
    /** Wide menu column width (px) at `wideMenuColumnExpandViewportMax` viewport width and above. */
    wideMenuColumnWidthMax: 70,
    /** Viewport width (px) where wide-menu column width starts at `wideMenuColumnWidthMin` (linear ramp); equals {@link layout.authenticatedHome.firstBreakpoint}. */
    wideMenuColumnExpandViewportMin: authenticatedHomeFirstBreakpointPx,
    /** Viewport width (px) where column width reaches `wideMenuColumnWidthMax`. */
    wideMenuColumnExpandViewportMax: 1240,
    /** Space between icon and label under it (px). */
    wideMenuIconLabelGap: 10,
    /** Vertical gap (px) between wallet address snippet and balance text on authenticated home header. */
    walletBalanceBelowAddressGap: 22,
    /** Vertical gap (px) between header row content and full-width divider below (wide layout only). */
    headerDividerTopGap: 22,
    /** Horizontal gap (px) between profile name and chevron on authenticated home header (`assets/header/right.svg`). */
    headerProfileChevronAfterNameGap: 10,
    /** Two-column body under header: default first column width (px) when `width > firstBreakpoint`. */
    splitPaneDefaultFirstColumnPx: 320,
    /** Two-column body: minimum first column width (px) while dragging the divider. */
    splitPaneMinFirstColumnPx: 280,
    /** Two-column body: minimum width (px) kept for the second column. */
    splitPaneMinSecondColumnPx: 320,
    /** Three-column body: minimum width (px) for the third (rightmost) tunable column. */
    splitPaneMinThirdColumnPx: 360,
    /** Three-column body: initial width (px) of the third column; user adjusts via the second divider. */
    splitPaneDefaultThirdColumnPx: 360,
    /**
     * Split-pane: draggable divider total hit width (px). Strip is centered on the column seam (overlapping padding);
     * `splitPaneDividerStrokePx` stroke is inset inside the strip — does not add flex width between columns.
     */
    splitPaneDividerHitWidthPx: 12,
    /** Two-column body: vertical split line width (px). Kept separate from horizontal `headerDividerHeight` to avoid conflating axes. */
    splitPaneDividerStrokePx: 1,
    /**
     * Two-column body: first column cannot be dragged wider than this (px). Matches {@link firstBreakpoint}
     * so the layout stays consistent with the compact single-column regime.
     */
    splitPaneMaxFirstColumnPx: authenticatedHomeFirstBreakpointPx,
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
    horizontalPadding: contentSideInsetPx,
    /** Custom 1px scroll-thumb columns (main web column + bottom bar); separate from `horizontalPadding`. */
    scrollbarRightInsetPx: 5,
  },
};

/**
 * Wide authenticated-home header menu: each column width ramps linearly with viewport width between
 * {@link layout.authenticatedHome.firstBreakpoint} / `wideMenuColumnWidthMin` and
 * {@link layout.authenticatedHome.wideMenuColumnExpandViewportMax} / `wideMenuColumnWidthMax`.
 */
export function authenticatedHomeWideMenuColumnWidthPx(windowWidth: number): number {
  const ah = layout.authenticatedHome;
  const lo = ah.wideMenuColumnExpandViewportMin;
  const hi = ah.wideMenuColumnExpandViewportMax;
  const span = hi - lo;
  const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (windowWidth - lo) / span));
  return Math.round(ah.wideMenuColumnWidthMin + t * (ah.wideMenuColumnWidthMax - ah.wideMenuColumnWidthMin));
}

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

/** Balance line under wallet address on authenticated home header (placeholder “1$”). */
export const homeWalletBalanceHeaderText: TextStyle = {
  fontSize: 30,
  lineHeight: 20,
  fontWeight: "400",
  includeFontPadding: false,
  paddingVertical: 0,
  textAlignVertical: "center",
};

/** Profile / display name under header icons on authenticated home. */
export const homeHeaderProfileNameText: TextStyle = {
  fontSize: 15,
  lineHeight: 20,
  fontWeight: "400",
  includeFontPadding: false,
  paddingVertical: 0,
  textAlignVertical: "center",
};
