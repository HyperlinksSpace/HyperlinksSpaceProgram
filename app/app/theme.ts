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

// Convenience hook: derive palette when used in React, using Telegram theme in TMA
// and dark theme as default/fallback elsewhere.
export function useColors(): ThemeColors {
  // Lazy import to avoid a hard dependency when this is used outside React.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useTelegram } = require("./components/Telegram") as {
    useTelegram: () => { colorScheme: ThemeName; isInTelegram: boolean };
  };
  const { colorScheme, isInTelegram } = useTelegram();

  const themeName: ThemeName =
    isInTelegram ? colorScheme : "dark";

  // Debug: trace final colors selection end-to-end.
  // eslint-disable-next-line no-console
  console.log("[useColors] resolved", { isInTelegram, colorScheme, themeName });

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

