# Responsive layout logic: main flow + promoted right panel + expanded AI

This document describes how to implement the layout behavior shown in the mockups:

- **Narrow/mobile**: single-column main flow.
- **Wide/desktop**: a selected menu item appears in a **separate right section**.
- **Widest/desktop+**: the **AI section expands** as an additional right-side area.
- Header and footer also transform by width/device.

---

## 1) Target behavior by width

Use three practical breakpoints:

- `compact` `< 900px`: one-column stack.
- `wide` `>= 900px and < 1400px`: main flow + one right panel.
- `ultra` `>= 1400px`: main flow + right panel + expanded AI panel.

These numbers are starting points. Tune visually after testing real content.

---

## 2) Core page composition

Keep one page shell and change only regions:

1. `HeaderRegion`
2. `BodyRegion`
   - `MainColumn` (feed/messages/swap/etc.)
   - `RightPanel` (promoted menu item content; only in `wide`/`ultra`)
   - `AiPanel` (expanded AI area; only in `ultra`)
3. `FooterRegion`

For route groups:

- `(auth)` keeps minimal chrome.
- `(app)` uses adaptive chrome and body regions.

---

## 3) Promote one menu item into right panel

Menu item list (example): `Feed`, `Messages`, `Tasks`, `Items`, `Coins`.

Rules:

1. On `compact`, selected item renders inside `MainColumn` only.
2. On `wide` and up, render selected item content in `RightPanel`.
3. Main column still controls selection; right panel is a synchronized detail view.

Implementation shape:

- Shared state in parent: `activeMenuItem`.
- `MainColumn` sets `activeMenuItem`.
- `RightPanel` receives `activeMenuItem` and renders matching component.
- Keep components reusable so they can render inline (mobile) or in side panel (desktop).

---

## 4) Expand AI on widest variant

On `ultra`, AI should no longer be a tiny footer-only affordance.

Rules:

1. Footer keeps quick action entry on all sizes.
2. In `ultra`, mount full `AiPanel` on the far right (or rightmost column).
3. AI panel width should be fixed range (`min 280`, `ideal 340`, `max 420`) so chart/main area stays readable.
4. Reuse one AI state/store; footer trigger and panel read/write the same prompt state.

---

## 5) Header transformation

Header behavior should adapt by width:

- `compact`: compact icons + balance + user info; horizontal action row may wrap/scroll.
- `wide`: full action row visible (Get, Swap, Deals, Trade, Send), with clearer spacing.
- `ultra`: add secondary context in header (selected market title, quick help, or account details).

Implementation:

- `HeaderMode = compact | wide | ultra`.
- Compute once from layout breakpoint.
- Use one `AdaptiveHeader` component with internal slots:
  - `leftSlot` (balance/account)
  - `centerSlot` (actions/nav)
  - `rightSlot` (tools/profile)

Avoid separate header components per breakpoint unless markup diverges heavily.

---

## 6) Footer transformation

Footer should also scale:

- `compact`: single-row CTA (`AI & Search`), possibly with Telegram connect button above.
- `wide`: retain CTA but align with body columns (left edge starts with main column).
- `ultra`: footer can show
  - left: AI quick input,
  - center: contextual action (e.g., Swap button area alignment),
  - right: AI panel shortcut/state indicator.

Implementation:

- `AdaptiveFooter` reads same layout mode.
- Keep one action API: `onOpenAi`, `onSubmitPrompt`, `onConnectTelegram`.
- Respect safe areas and keyboard overlap on native.

---

## 7) Layout algorithm (recommended)

Create a small hook:

- `useLayoutMode()` returns:
  - `mode: compact | wide | ultra`
  - booleans: `showRightPanel`, `showExpandedAi`
  - widths: `rightPanelWidth`, `aiPanelWidth`

Pseudo-layout decisions:

1. If `compact`: `Body = MainColumn`.
2. If `wide`: `Body = MainColumn + RightPanel`.
3. If `ultra`: `Body = MainColumn + RightPanel + AiPanel`.

Use CSS grid on web and flex with measured widths on native/web RN as needed.

---

## 8) Suggested sizing model

For web (RN-web or CSS equivalent):

- Container max width: `1800-1920`.
- `MainColumn`: `minmax(640, 1fr)`.
- `RightPanel`: `320-420`.
- `AiPanel`: `300-420`.
- Gap: `12-20`.

For compact:

- Single column full width with content padding `12-16`.

---

## 9) Data/state boundaries

Keep state ownership stable:

- Parent page layout:
  - `activeMenuItem`
  - `selectedAsset` / trading context
  - `aiDraft` / AI panel open state
- Child regions are presentational + callbacks.

This prevents duplicate logic when same content moves between inline and side panel variants.

---

## 10) Performance and UX notes

1. Do not remount heavy charts on every resize; debounce mode changes.
2. Keep panel transitions subtle (fade/slide 120-180ms).
3. Preserve scroll positions per menu item.
4. On breakpoint crossing, keep current active item and AI draft.

---

## 11) Rollout plan

1. Build `useLayoutMode()` and wire into `(app)` shell.
2. Refactor header/footer into `AdaptiveHeader` and `AdaptiveFooter`.
3. Extract menu item content into reusable content components.
4. Add `RightPanel` for `wide`.
5. Add `AiPanel` for `ultra`.
6. Tune widths and spacing against real device screenshots.

---

## 12) One-line implementation stance

Treat responsiveness as **region orchestration** (not separate pages): keep one main stateful flow, promote selected menu content into a right panel on wide screens, add expanded AI as a third column on ultra-wide screens, and switch header/footer slots by the same layout mode.

