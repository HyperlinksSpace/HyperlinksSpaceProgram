# Header/Footer adaptation by page and device

Yes - you can (and should) make header and footer behavior depend on both **route** and **runtime** (web, native, Telegram Mini App).

This note describes a minimal, scalable pattern for this repository.

---

## 1) Goal

Keep one global app shell, but allow each page group to define:

- whether header is shown
- whether footer is shown
- which variant is used (full, compact, hidden)
- device-specific behavior (web vs native vs TMA)

---

## 2) Current baseline in this repo

`app/_layout.tsx` currently always renders:

- `GlobalLogoBarWithFallback` at top
- page `<Stack />` in the middle
- `GlobalBottomBarWeb` (web) or `GlobalBottomBar` (native/TMA) at bottom

This is simple, but it means welcome/auth pages inherit the same bars as app pages.

---

## 3) Recommended structure (minimal and clear)

Use route-group layouts as shell boundaries:

- `app/(auth)/_layout.tsx` -> auth shell (welcome/login flow)
- `app/(app)/_layout.tsx` -> app shell (home/ai/settings/etc.)

Then:

1. Keep `app/_layout.tsx` for providers only (`TelegramProvider`, `AuthProvider`, theme setup).
2. Move top/bottom bars out of root and into the group layout(s) that need them.
3. In each group layout, select variants by device/platform.

This keeps file structure small while preventing UI condition spaghetti in one file.

---

## 4) Adaptation matrix

| Route group | Web | Native app | Telegram Mini App |
|---|---|---|---|
| `(auth)` | Header optional (brand only), footer hidden | Header optional, footer hidden | Header optional, footer hidden |
| `(app)` | Full header + web footer/search | Full header + native footer/search | TMA-aware header + native footer/search |

Notes:

- Welcome screen is usually cleaner with no footer controls.
- App pages should keep navigation/actions visible and consistent.
- In TMA, preserve Telegram theme sync and avoid pre-theme flashes.

---

## 5) How to implement (practical)

### A. Auth layout (`app/(auth)/_layout.tsx`)

- Render a `Stack` with `headerShown: false`.
- If needed, render a minimal top brand component only.
- Do not mount bottom bar.

### B. App layout (`app/(app)/_layout.tsx`)

- Keep auth guard redirect to `/welcome`.
- Render top bar + content + bottom bar.
- Branch footer by `Platform.OS` (web/native), same as current root logic.

### C. Optional per-page override

If a specific page needs no bars (for example, fullscreen flow), add route metadata in code:

- simple approach: maintain a tiny set of route names in group layout (`hiddenHeaderRoutes`, `hiddenFooterRoutes`)
- cleaner later: create a `ScreenChromeContext` with `{ header: "full" | "compact" | "none", footer: ... }`

Do not over-engineer before multiple special pages actually exist.

---

## 6) Theme and color consistency rules

1. All screens use `useColors()` (`background`, `primary`, `secondary`).
2. Header/footer must read from the same theme source.
3. Avoid hard-coded light/dark literals in page components.
4. For TMA, keep `themeBgReady` guard behavior to prevent flash/mismatch.

---

## 7) Suggested near-term rollout

1. Keep current providers in `app/_layout.tsx`.
2. Move header/footer rendering from root to `app/(app)/_layout.tsx`.
3. Keep `app/(auth)/_layout.tsx` minimal (no footer).
4. Leave welcome blank now, but already under `(auth)` so future auth UI is isolated.
5. Add one shared `PageContainer` helper later if repeated spacing/styling appears.

---

## 8) One-line decision

Use **group-based shell adaptation**: auth routes get a minimal chrome, app routes get full chrome, and device-specific variants are selected inside each group layout using the same `useColors()` theme contract.

