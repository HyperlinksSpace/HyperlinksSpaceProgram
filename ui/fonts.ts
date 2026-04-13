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
