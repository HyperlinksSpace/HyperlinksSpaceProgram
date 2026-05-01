/**
 * Noto Sans / Noto Sans Mono via `@expo-google-fonts/*`, loaded in root layout (`useFonts`).
 * Use **`fontWeight: "400"`** with SemiBold/Bold faces — discrete TTFs register as separate families on RN.
 */

/** Must match keys in `UI_GOOGLE_FONT_LOAD_MAP` (`ui/uiGoogleFonts.ts`). */
export const FONT_UI_SANS_REGULAR = "NotoSans_400Regular";
export const FONT_UI_SANS_SEMIBOLD = "NotoSans_600SemiBold";
export const FONT_UI_SANS_BOLD = "NotoSans_700Bold";
export const FONT_UI_MONO_REGULAR = "NotoSansMono_400Regular";

export const WEB_UI_SANS_STACK = `${FONT_UI_SANS_REGULAR}, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

export const WEB_UI_MONO_STACK = `${FONT_UI_MONO_REGULAR}, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

/** RN: pick the loaded face that matches `fontWeight` (numeric or string). */
export function fontUiSansFamilyForWeight(weight?: string | number | null): string {
  const raw = weight ?? "400";
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return FONT_UI_SANS_REGULAR;
  if (n >= 700) return FONT_UI_SANS_BOLD;
  if (n >= 600) return FONT_UI_SANS_SEMIBOLD;
  return FONT_UI_SANS_REGULAR;
}
