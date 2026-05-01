/**
 * Web typography — used by the web textarea in GlobalBottomBar + global.css.
 *
 * **Brand intent:** Aeroport (geometric / grotesk-style sans). There are **no** `.otf`/`.ttf`
 * files in this Expo app repo yet, so `"Aeroport"` alone resolves to **nothing** and the
 * browser picks an unpredictable fallback (often a **serif** / “antiqua” look in WebView).
 *
 * Always append a **system UI sans** stack so you get a neutral grotesk-like face until
 * real files are added (see `docs/fonts.md`).
 */
export const WEB_UI_SANS_STACK =
  'Aeroport, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Monospace stack for wallet addresses / codes. **`Aeroport Mono` first** when bundled via `@font-face`
 * or `expo-font`; otherwise falls back to system monospace (see `texts/fonts.md`).
 */
export const WEB_UI_MONO_STACK =
  'Aeroport Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
