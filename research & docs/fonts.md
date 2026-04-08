# Fonts (Expo web / TMA)

## What the bottom bar asks for today

- **Name in code:** **`Aeroport`** (geometric / grotesk-style sans — the brand face used elsewhere in the product).
- **Reality in this repo:** There is **no** Aeroport font file under `app/assets/` and **no** `@font-face` rule, so **the browser cannot load “Aeroport”**. It falls back — in Telegram’s WebView that often looks like a **serif** (“antiqua”), not a grotesk.

## What you see after the fix

- **`app/fonts.ts`** exports **`WEB_UI_SANS_STACK`**: **`Aeroport` first** (for when files exist), then **`ui-sans-serif, system-ui, …, sans-serif`** so text always uses a **modern sans** until Aeroport is bundled.

## How to use real Aeroport (optional)

1. Add licensed `.otf`/`.ttf` files, e.g. `app/assets/fonts/Aeroport-Regular.otf`.
2. Register with **`expo-font`** in the root layout, e.g. `useFonts({ Aeroport: require("./assets/fonts/Aeroport-Regular.otf") })`.
3. Add **`@font-face`** in `global.css` if you prefer pure CSS loading on web (paths must match the exported static asset URL).

Until then, the **stack** in `global.css` + `GlobalBottomBarWeb` keeps the UI **grotesk-like** via system fonts.
