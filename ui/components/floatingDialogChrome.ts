import { Platform, type TextStyle } from "react-native";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../fonts";
import { layout, typographySansSemibold } from "../theme";

export const DIALOG_PAD_X_PX = 20;

/** Minimum gap between sheet edge and viewport on phones (side gutters). */
export const DIALOG_VIEWPORT_SIDE_INSET_MIN_PX = 16;

/**
 * Extra space below Telegram’s reported safe/content top inset so sheet chrome
 * does not sit under the close / menu controls.
 */
export const DIALOG_TMA_TOP_CLEARANCE_PX = 20;

/**
 * Floor for the dialog top inset inside TMA. Telegram’s close + ⋯ controls need
 * roughly this much even when `safeArea` / `contentSafeArea` under-report.
 */
export const DIALOG_TMA_TOP_MIN_PX = 56;

export type FloatingDialogViewportInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * Viewport margins for floating dialogs.
 * - Sides: at least {@link DIALOG_VIEWPORT_SIDE_INSET_MIN_PX} (wider than zero on mobile).
 * - Top: clears TMA safeArea + contentSafeArea (and a minimum header band) so sheets
 *   stay below Telegram’s built-in close / menu icons.
 */
export function resolveFloatingDialogViewportInsets(opts?: {
  windowWidth?: number;
  safeAreaInsetTop?: number;
  contentSafeAreaInsetTop?: number;
  safeAreaInsetBottom?: number;
  /** When true, apply TMA top floor even if safe/content insets are still 0. */
  inTelegram?: boolean;
}): FloatingDialogViewportInsets {
  const base = layout.contentSideInsetPx;
  const side = Math.max(DIALOG_VIEWPORT_SIDE_INSET_MIN_PX, base);
  const winW =
    typeof opts?.windowWidth === "number" && opts.windowWidth > 0
      ? opts.windowWidth
      : 400;
  // Slightly roomier gutters on very narrow phones.
  const sideInset = winW < 380 ? Math.max(side, 18) : side;

  const safeTop = Math.max(0, opts?.safeAreaInsetTop ?? 0);
  const contentTop = Math.max(0, opts?.contentSafeAreaInsetTop ?? 0);
  const tmaTop = safeTop + contentTop;
  const inTelegram = Boolean(opts?.inTelegram);
  const top =
    tmaTop > 0 || inTelegram
      ? Math.max(
          sideInset,
          DIALOG_TMA_TOP_MIN_PX,
          Math.ceil(tmaTop + DIALOG_TMA_TOP_CLEARANCE_PX),
        )
      : sideInset;

  const safeBottom = Math.max(0, opts?.safeAreaInsetBottom ?? 0);
  const bottom = Math.max(sideInset, safeBottom > 0 ? safeBottom + 4 : sideInset);

  return { left: sideInset, right: sideInset, top, bottom };
}

const dialogSansRegular: TextStyle = Platform.select({
  web: { fontFamily: WEB_UI_SANS_STACK },
  default: { fontFamily: FONT_UI_SANS_REGULAR },
}) ?? {};

/** Balanced header/body insets that stay readable from phone to desktop. */
export function resolveFloatingDialogInsets(windowHeight: number): {
  padX: number;
  headerPadTop: number;
  headerPadBottom: number;
  bodyPadTop: number;
  bodyPadBottom: number;
} {
  const h = Number.isFinite(windowHeight) && windowHeight > 0 ? windowHeight : 800;
  return {
    padX: DIALOG_PAD_X_PX,
    headerPadTop: Math.max(16, Math.min(24, Math.round(h * 0.022))),
    headerPadBottom: Math.max(10, Math.min(14, Math.round(h * 0.014))),
    bodyPadTop: 8,
    bodyPadBottom: Math.max(20, Math.min(32, Math.round(h * 0.03))),
  };
}

/** Dialog window title — readable, not heavy. */
export const floatingDialogTitleTextStyle: TextStyle = {
  ...dialogSansRegular,
  fontSize: 17,
  lineHeight: 22,
  fontWeight: "400",
  letterSpacing: -0.2,
  textAlign: "left",
  includeFontPadding: false,
};

/** In-dialog section heading (e.g. “Connection methods”, “Theme”). */
export const floatingDialogSectionTextStyle: TextStyle = {
  ...typographySansSemibold,
  fontSize: 16,
  lineHeight: 21,
  letterSpacing: -0.15,
  textAlign: "left",
};

/** Method / subsection label (e.g. “Scan QR”) — regular, below section. */
export const floatingDialogSubtitleTextStyle: TextStyle = {
  ...dialogSansRegular,
  fontSize: 14,
  lineHeight: 19,
  fontWeight: "400",
  letterSpacing: -0.05,
  textAlign: "left",
  includeFontPadding: false,
};

/** Supporting copy under a heading — smaller, muted at call site. */
export const floatingDialogBodyTextStyle: TextStyle = {
  ...dialogSansRegular,
  fontSize: 13,
  lineHeight: 18,
  fontWeight: "400",
  letterSpacing: 0.05,
  textAlign: "left",
  includeFontPadding: false,
};

export const floatingDialogHeaderWebNoDragProps =
  Platform.OS === "web" ? ({ "data-floating-no-drag": "1" } as object) : {};
