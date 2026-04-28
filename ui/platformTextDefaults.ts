import { Platform, Text, TextInput } from "react-native";

type WithDefaultStyle = {
  defaultProps?: { style?: unknown };
};

/**
 * Android adds extra font padding to `Text` / `TextInput` by default, which pushes glyphs down in
 * fixed-height rows. Web is handled via `line-height` inheritance on `#root` in `global.css`.
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
  if (Platform.OS !== "android") return;
  appendDefaultStyle(Text as WithDefaultStyle, { includeFontPadding: false });
  appendDefaultStyle(TextInput as WithDefaultStyle, { includeFontPadding: false });
}
