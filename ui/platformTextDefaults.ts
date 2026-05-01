import { Text, TextInput } from "react-native";
import { FONT_UI_SANS_REGULAR } from "./fonts";
import { uiTextVerticalCompensationTransform } from "./theme";

type WithDefaultStyle = {
  defaultProps?: { style?: unknown };
};

/**
 * Android adds extra font padding to `Text` / `TextInput` by default, which pushes glyphs down in
 * fixed-height rows. The prop is Android-only (`false` elsewhere is ignored).
 */
function appendDefaultStyle(ctor: WithDefaultStyle, patch: object): void {
  const prev = ctor.defaultProps?.style;
  const base = Array.isArray(prev) ? prev : prev != null ? [prev] : [];
  ctor.defaultProps = {
    ...(ctor.defaultProps ?? {}),
    style: [...base, patch],
  };
}

/** Call once at startup (e.g. from `app/_layout.tsx` before React renders). */
export function applyPlatformTextDefaults(): void {
  appendDefaultStyle(Text as WithDefaultStyle, { includeFontPadding: false });
  appendDefaultStyle(TextInput as WithDefaultStyle, { includeFontPadding: false });
}

let uiSansFontFamilyApplied = false;

/** After `useFonts` succeeds — sets default UI sans for `Text` / `TextInput` on all platforms. */
export function ensureUiSansFontFamilyDefaults(): void {
  if (uiSansFontFamilyApplied) return;
  uiSansFontFamilyApplied = true;
  appendDefaultStyle(Text as WithDefaultStyle, {
    fontFamily: FONT_UI_SANS_REGULAR,
    paddingVertical: 0,
    ...uiTextVerticalCompensationTransform,
  });
  appendDefaultStyle(TextInput as WithDefaultStyle, {
    fontFamily: FONT_UI_SANS_REGULAR,
    paddingVertical: 0,
    ...uiTextVerticalCompensationTransform,
  });
}
