/** Telegram built-in accent palette (ids 0–6). */
const BUILTIN_ACCENT_LIGHT = [
  "#E17076",
  "#FAA774",
  "#A695E7",
  "#7BC862",
  "#6EC9CB",
  "#6CA1EB",
  "#E47BAD",
] as const;

const BUILTIN_ACCENT_DARK = [
  "#FF8585",
  "#FFAC72",
  "#B18FFF",
  "#85D685",
  "#7ADCE6",
  "#8BB3FF",
  "#FF9ACC",
] as const;

export type TelegramUserAccentColors = {
  light: string | null;
  dark: string | null;
};

function unpackTdlibRgbColor(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rgb = Math.trunc(n);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return `#${[r, g, b].map((ch) => ch.toString(16).padStart(2, "0")).join("")}`;
}

function builtinAccentColors(id: number): TelegramUserAccentColors | null {
  if (!Number.isFinite(id) || id < 0 || id > 6) return null;
  return {
    light: BUILTIN_ACCENT_LIGHT[id] ?? null,
    dark: BUILTIN_ACCENT_DARK[id] ?? null,
  };
}

/** Parse TDLib `user` accent fields into light/dark display colors. */
export function parseUserAccentColors(user: Record<string, unknown>): TelegramUserAccentColors {
  const accentColor = user.accent_color ?? user.accentColor;
  if (accentColor && typeof accentColor === "object") {
    const row = accentColor as Record<string, unknown>;
    const light = unpackTdlibRgbColor(row.light_theme_accent_color ?? row.lightThemeAccentColor);
    const dark = unpackTdlibRgbColor(row.dark_theme_accent_color ?? row.darkThemeAccentColor);
    if (light || dark) {
      return { light, dark };
    }
    const builtIn = Number(row.built_in_accent_color_id ?? row.builtInAccentColorId ?? row.id);
    const builtin = builtinAccentColors(builtIn);
    if (builtin) return builtin;
  }

  const accentColorId = Number(user.accent_color_id ?? user.accentColorId);
  const builtin = builtinAccentColors(accentColorId);
  if (builtin) return builtin;

  return { light: null, dark: null };
}

export function resolveTelegramUserAccentColor(
  colors: TelegramUserAccentColors | null | undefined,
  scheme: "light" | "dark",
): string | null {
  if (!colors) return null;
  if (scheme === "dark") return colors.dark ?? colors.light ?? null;
  return colors.light ?? colors.dark ?? null;
}
