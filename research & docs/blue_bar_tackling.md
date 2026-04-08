## Blue bar & cursor issue in GlobalBottomBar (Telegram Mini App, iOS)

### Context

- The issue appears **only inside the Telegram Mini App (TMA) on iOS**.
- The affected element is the **bottom AI input** implemented by `GlobalBottomBar` (`TextInput` wrapped in a `ScrollView`, with a custom scrollbar on the right).
- On **desktop web** and standard browsers, the input behaves as intended: normal caret, no intrusive system scrollbar; our custom scrollbar is visible and correct.
- On **Telegram Desktop TMA**, behavior also looks acceptable.
- On **Telegram iOS TMA**, a **thick vertical blue line** appears on the right side of the input, and it visually replaces/obscures the caret, especially near the right edge of the text.

### What the blue bar is

- The blue bar is **not our custom scrollbar** and not a React Native element.
- It is the **system scroll thumb** / scrollbar rendered by the iOS WebView that Telegram uses for Mini Apps:
  - Appears when the underlying DOM element backing `TextInput` is scrollable.
  - On iOS it is rendered as a thick blue bar overlay on the right.
  - Its color and thickness are **controlled by the OS / WebView**, not standard CSS in many cases.
- Even when we:
  - Add `scrollbar-width: none;` (Firefox),
  - Add `-ms-overflow-style: none;` (IE/Edge),
  - Add `::-webkit-scrollbar { width: 0; height: 0; }` (WebKit),
  the iOS Telegram WebView **still draws** this overlay thumb in some configurations.

### Current RN Web / layout setup

- `TextInput` (RN Web) is rendered with:
  - `multiline`
  - `lineHeight = 20`
  - Dynamic height controlled via `inputDynamicStyle` (1–8 lines).
  - `scrollEnabled={Platform.OS !== "web"}` so **on web** we *try* to disable internal scrolling.
- Around this `TextInput` we have:
  - An outer `ScrollView` that provides scrolling for long content.
  - A **custom scrollbar** drawn along the bar edge, based on `scrollY` and `contentHeight`.
- We also:
  - Inject a `<style>` tag on web to hide scrollbars on any `[data-ai-input="true"]`.
  - Add a right-side overlay `View` (gutter) inside the input container on web, with:
    - `position: "absolute"`, `right: 0`, `top: 0`, `bottom: 0`, `width: 10`,
    - `backgroundColor: colors.background`,
    - `pointerEvents: "none"`.
  - Increase `paddingRight` on the input on web so the caret and last characters do not go under the overlay.

### Observed behavior by platform

- **Desktop web (normal browser)**:
  - Native scroll thumb is hidden (CSS + overlay).
  - Text caret is clearly visible at the end of the text.
  - Our custom scrollbar works and reflects scroll position correctly.

- **Telegram Desktop TMA**:
  - Behavior closely matches desktop web.
  - No problematic blue bar; caret looks normal.

- **Telegram iOS TMA**:
  - A thick **blue vertical bar** still appears on the right side of the input.
  - The bar roughly aligns with where the platform scroll thumb would sit.
  - It **does not fully respect** our CSS scrollbar-hiding rules.
  - It appears even when:
    - `scrollEnabled={false}` on the `TextInput` for web.
    - We rely solely on the outer `ScrollView` for scroll.
    - We overlay the right edge with a background-colored React `View`.
  - The caret is technically present, but visually:
    - The blue bar is more dominant than the caret and sits at the same x-position,
    - So the user perceives it as a “weird blue cursor” instead of a scroll thumb.
  - The last character near the right edge can appear slightly crowded/overlapped because of how the webview draws the thumb and because we are trying to line things up tightly near the arrow icon.

### Why Flutter/dart implementation did not show this issue

- The original Flutter implementation ran as **native UI** (or Flutter Web with different internals), not as React Native Web inside Telegram’s custom webview.
- Flutter’s text fields:
  - Use their own composited rendering and native text controls.
  - Have direct hooks into platform scroll behavior and caret rendering.
  - Can fully own the scrollable area and scrollbar appearance.
- In contrast, RN Web:
  - Uses the browser/Telegram WebView’s textarea or contenteditable under the hood.
  - Has to live with OS/WebView scroll thumb behavior.
  - Only partially controls scrollbars via CSS, which the iOS Telegram WebView may override.

### Why the bar is blue and how much we can style it

- On iOS Safari / WebView, the scroll thumb color and style are **not standard CSS-stylable**:
  - There is no official `::-webkit-scrollbar-thumb` support for iOS Safari comparable to desktop.
  - The color (blue) is tied to the system accent / theme and internal WebKit defaults.
  - Telegram’s WebView may apply its own styling on top.
- Because of this:
  - We **cannot reliably change** the thumb color to match our background.
  - We **cannot reliably make it fully transparent** without also breaking scrolling in this embedded environment.
  - Any success we get with `::-webkit-scrollbar*` rules on desktop Safari/Chrome does not necessarily carry over to Telegram iOS.

### Attempts made so far (and results)

1. **CSS-based hiding on `[data-ai-input="true"]`**  
   - Rules: `scrollbar-width: none;`, `-ms-overflow-style: none;`, `::-webkit-scrollbar { width: 0; }`.  
   - Works in normal browsers and some webviews.  
   - In Telegram iOS WebView, the blue bar persists.

2. **Disabling internal `TextInput` scrolling on web**  
   - `scrollEnabled={Platform.OS !== "web"}` to avoid the input’s own scrollable area.  
   - Rely on outer `ScrollView` + custom scrollbar.  
   - The blue thumb still appears in TMA iOS, suggesting the underlying DOM element is still treated as scrollable by the WebView (or the thumb is drawn by an outer layer).

3. **Right-edge overlay gutter**  
   - Relative container + absolutely positioned right-side `View` with `backgroundColor: colors.background`.  
   - `pointerEvents="none"` so it doesn’t break input.  
   - On desktop, this effectively hides any native thumb.  
   - On Telegram iOS, the blue bar can still appear visually on top or just beside that gutter, i.e. the overlay does not fully cover what the WebView paints.

4. **Extra `paddingRight` on the input**  
   - Prevents text/caret from touching the thumb/overlay region.  
   - Improves readability of the last character, but the blue line remains visible.

5. **DOM scroll listener + custom scrollbar**  
   - We now track `scrollTop` of the underlying DOM node and sync our custom scrollbar correctly.  
   - This is independent of the blue bar; it only ensures scroll indicator accuracy.

### Current understanding / constraints

- The blue bar on iOS Telegram Mini App is **owned by the host WebView**, not by our CSS or RN Web.  
- That WebView:
  - May treat the entire scrollable area (outer + inner) as a single scrollable region and draw an overlay thumb for accessibility/UX.
  - May ignore some CSS attempts to hide or restyle the thumb.
- Because of these constraints:
  - We **cannot guarantee complete removal** or recoloring of the blue bar in all TMA/iOS cases.
  - The safest path is to ensure:
    - The caret and text are not visually overlapped (padding + layout tweaks).
    - Our own scrollbar remains accurate and subtle.
    - We don’t break native input behavior (selection, IME, copy/paste, scroll).

### Potential future mitigations

- **Platform-specific layout tweaks for TMA iOS**:
  - Detect `Telegram.WebApp.platform === "ios"` in JS and:
    - Increase right gutter width.
    - Slightly reduce the visible width of the input to give the thumb more room.
  - Accept that the bar exists but keep it visually away from text/caret.

- **Experiment with non-scrollable inner element**:
  - Render text inside a non-scrollable container and rely solely on outer scrolling.  
  - Risk: may break text selection behavior and IME interaction in TMA; needs careful testing.

- **Ask Telegram / WebView owners**:
  - There may be feature flags or Meta tags specific to Telegram’s WebView that influence scrollbar presentation on iOS.
  - If such an option exists, it would be the cleanest way to disable the blue overlay globally for the Mini App.

