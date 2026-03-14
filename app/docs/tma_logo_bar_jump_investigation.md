# TMA logo bar jump on input focus – fix

## Problem

When the user focuses the AI & Search input in the Telegram Mini App, the keyboard opens and the logo bar jumps (shifts down then up). The whole column (logo bar + main + bottom bar) was also scrollable.

**Cause:** Viewport height shrinks when the keyboard opens; if root/body height follows that, the layout reflows and the host may scroll the window → logo bar moves. Reacting on every browser resize (e.g. Visual Viewport) caused intermediate reflows before the final state.

## What we tried (dismissed or replaced)

| Approach | Outcome |
|----------|--------|
| **Position fixed for logo bar** | Reverted. Did not fix the shift inside TMA. |
| **Root height from `viewport.stableHeight()`** (pin layout to stable height so it doesn’t change on keyboard) | Not used. We chose “single update when TMA reports” instead. |
| **Visual Viewport API** (`window.visualViewport` resize + `body.style.height` + `--vh` + `scrollTo(0,0)` on every resize) | Replaced. Caused intermediate reflows; keyboard open triggered multiple resize events before the final size. |
| **Scroll lock only** (prevent window scroll) | Necessary but not sufficient on its own; layout still shifted. |

## Solution

Use **only the TMA viewport API**. When the keyboard opens, change nothing until TMA sends **viewport_changed**; then apply the new height and scroll reset in one turn.

### 1. TMA viewport (Telegram.tsx)

- After `viewport.mount()`:
  - **`viewport.bindCssVars()`** – SDK sets/updates `--tg-viewport-height`. Layout height is driven by this.
  - **`on("viewport_changed", handler)`** – Run **`window.scrollTo(0, 0)` only when `payload.is_state_stable`** (or `payload.isStateStable`). Do not reset scroll during drag or animation.
- **Window scroll lock** – `window.addEventListener("scroll", …)` → if `scrollY > 0` then `scrollTo(0, 0)`.
- **viewport-fit=cover** on the viewport meta (iOS).

### 2. CSS (global.css)

- **html**: `height: 100%`, `overflow: hidden`, `overscroll-behavior: none`.
- **body**, **#root** / **[data-expo-root]**: `height: var(--tg-viewport-height, 100%)`, `min-height: var(--tg-viewport-height, 100%)`, `overflow: hidden` (body also `overscroll-behavior: none`).

### 3. Layout

- **Root View** (_layout.tsx): `overflow: "hidden"`, flex column.
- **Logo bar** (GlobalLogoBar): `flexShrink: 0`.
- **Main**: `flex: 1`, `minHeight: 0`.

### 4. TMA (telegramWebApp.ts)

- **readyAndExpand()**: `expand()`, `setHeaderColor("#000000")`, `setupSwipeBehavior({ allow_vertical_swipe: false })`, `disableVerticalSwipes?.()`.

## viewport_changed payload

| Field | Type | Description |
|-------|------|-------------|
| `height` | number | Viewport height. |
| `width` | number (optional) | Viewport width. |
| `is_expanded` | boolean | Viewport expanded. |
| `is_state_stable` | boolean | State stable (no change in the next moment). |

Only call `scrollTo(0, 0)` when **is_state_stable** is true. Support both `is_state_stable` and `isStateStable` (bridge payload shape).

## Summary: keep vs dismiss

**Keep in the stack:**

- TMA-only viewport logic: `viewport.bindCssVars()`, `on("viewport_changed", …)` with **is_state_stable** check before `scrollTo(0, 0)`, window scroll lock, viewport-fit=cover.
- CSS: `--tg-viewport-height` for body and #root, overflow/overscroll locked on html/body and root.
- Root `overflow: "hidden"` and logo bar `flexShrink: 0`.
- readyAndExpand (expand, setHeaderColor, setupSwipeBehavior, disableVerticalSwipes).

**Dismiss as try-outs:**

- Any use of **Visual Viewport API** for TMA (resize/scroll listeners, `body.style.height`, `--vh`) — replaced by TMA viewport + bindCssVars + viewport_changed.
- **Position fixed** for the logo bar — reverted.
- **stableHeight**-based root height — not used; we use bindCssVars (current height) and rely on **is_state_stable** to avoid resetting scroll until the viewport is stable.
