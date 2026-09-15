import { Platform } from "react-native";
import {
  resolveFloatingDialogViewportInsets,
  type FloatingDialogViewportInsets,
} from "./floatingDialogChrome";

export type FloatingDialogEdge = "n" | "s" | "e" | "w";
export type FloatingDialogResizeHandle =
  | FloatingDialogEdge
  | "ne"
  | "nw"
  | "se"
  | "sw";

export type FloatingDialogSize = { width: number; height: number };
export type FloatingDialogOffset = { x: number; y: number };

export const FLOATING_DIALOG_HANDLES: FloatingDialogResizeHandle[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

export function edgesForFloatingDialogHandle(
  handle: FloatingDialogResizeHandle,
): FloatingDialogEdge[] {
  if (handle === "n" || handle === "s" || handle === "e" || handle === "w") return [handle];
  if (handle === "ne") return ["n", "e"];
  if (handle === "nw") return ["n", "w"];
  if (handle === "se") return ["s", "e"];
  return ["s", "w"];
}

export function cursorForFloatingDialogHandle(handle: FloatingDialogResizeHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "row-resize";
    case "e":
    case "w":
      return "col-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    default:
      return "nwse-resize";
  }
}

export function clampFloatingDialogSize(
  size: FloatingDialogSize,
  min: FloatingDialogSize,
  max: FloatingDialogSize,
): FloatingDialogSize {
  return {
    width: Math.min(max.width, Math.max(min.width, Math.round(size.width))),
    height: Math.min(max.height, Math.max(min.height, Math.round(size.height))),
  };
}

/** Largest size that still fits the viewport with side / safe-area insets. */
export function floatingDialogViewportMax(
  windowWidth: number,
  windowHeight: number,
  insetPxOrInsets: number | FloatingDialogViewportInsets = 15,
): FloatingDialogSize {
  const insets: FloatingDialogViewportInsets =
    typeof insetPxOrInsets === "number"
      ? {
          left: insetPxOrInsets,
          right: insetPxOrInsets,
          top: insetPxOrInsets,
          bottom: insetPxOrInsets,
        }
      : insetPxOrInsets;
  return {
    width: Math.max(280, Math.floor(windowWidth - insets.left - insets.right)),
    height: Math.max(220, Math.floor(windowHeight - insets.top - insets.bottom)),
  };
}

export type FloatingDialogSizeKind = "profile" | "profileList" | "modal" | "picker" | "connect" | "pro";

/**
 * Reasonable first-open size from viewport + dialog role.
 * Always clamped to the screen; callers may still enable fitContentHeight.
 */
export function resolveFloatingDialogDefaultSize(
  windowWidth: number,
  windowHeight: number,
  kind: FloatingDialogSizeKind,
  viewportInsets?: FloatingDialogViewportInsets,
): FloatingDialogSize {
  const insets =
    viewportInsets ??
    resolveFloatingDialogViewportInsets({ windowWidth });
  const max = floatingDialogViewportMax(windowWidth, windowHeight, insets);
  const prefer = (width: number, height: number) =>
    clampFloatingDialogSize({ width, height }, { width: 280, height: 220 }, max);

  switch (kind) {
    case "profile":
      // Width-first guess; fitContentHeight shrinks height to the sheet body.
      return prefer(
        Math.min(420, Math.max(360, Math.round(windowWidth * 0.34))),
        Math.min(520, Math.max(280, Math.round(windowHeight * 0.55))),
      );
    case "profileList":
      // Media / playlist: more vertical room for scrollable grids.
      return prefer(
        Math.min(440, Math.max(360, Math.round(windowWidth * 0.36))),
        Math.min(720, Math.max(540, Math.round(windowHeight * 0.84))),
      );
    case "picker":
      return prefer(
        Math.min(400, Math.max(340, Math.round(windowWidth * 0.34))),
        Math.min(560, Math.max(420, Math.round(windowHeight * 0.65))),
      );
    case "connect":
      // QR + extra connect methods need a tall first-open frame.
      return prefer(
        Math.min(420, Math.max(360, Math.round(windowWidth * 0.34))),
        Math.min(760, Math.max(560, Math.round(windowHeight * 0.82))),
      );
    case "pro":
      return prefer(
        Math.min(460, Math.max(380, Math.round(windowWidth * 0.38))),
        Math.min(780, Math.max(620, Math.round(windowHeight * 0.86))),
      );
    case "modal":
    default:
      return prefer(
        Math.min(420, Math.max(340, Math.round(windowWidth * 0.32))),
        Math.min(560, Math.max(400, Math.round(windowHeight * 0.62))),
      );
  }
}

/**
 * Keep the sheet inside the safe viewport rect (center-anchored + offset).
 * When `insets` is omitted, falls back to keeping `minVisible` px on-screen.
 */
export function clampFloatingDialogOffset(
  offset: FloatingDialogOffset,
  size: FloatingDialogSize,
  winW: number,
  winH: number,
  minVisibleOrInsets: number | FloatingDialogViewportInsets = 48,
): FloatingDialogOffset {
  const centerX = winW / 2;
  const centerY = winH / 2;
  let x = Math.round(offset.x);
  let y = Math.round(offset.y);
  const left = centerX - size.width / 2 + x;
  const top = centerY - size.height / 2 + y;

  if (typeof minVisibleOrInsets === "number") {
    const minVisible = minVisibleOrInsets;
    if (left + size.width < minVisible) x += minVisible - (left + size.width);
    if (left > winW - minVisible) x -= left - (winW - minVisible);
    if (top + size.height < minVisible) y += minVisible - (top + size.height);
    if (top > winH - minVisible) y -= top - (winH - minVisible);
    return { x: Math.round(x), y: Math.round(y) };
  }

  const insets = minVisibleOrInsets;
  const minLeft = insets.left;
  const maxLeft = winW - insets.right - size.width;
  const minTop = insets.top;
  const maxTop = winH - insets.bottom - size.height;

  if (Number.isFinite(minLeft) && Number.isFinite(maxLeft)) {
    if (maxLeft >= minLeft) {
      const clampedLeft = Math.min(maxLeft, Math.max(minLeft, left));
      x += clampedLeft - left;
    } else {
      // Sheet wider than safe band — center in the band.
      const bandCenter = (insets.left + winW - insets.right) / 2;
      x += bandCenter - size.width / 2 - left;
    }
  }
  if (Number.isFinite(minTop) && Number.isFinite(maxTop)) {
    if (maxTop >= minTop) {
      const clampedTop = Math.min(maxTop, Math.max(minTop, top));
      y += clampedTop - top;
    } else {
      const bandCenter = (insets.top + winH - insets.bottom) / 2;
      y += bandCenter - size.height / 2 - top;
    }
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/** Bias initial offset so the sheet centers in the safe band (not the raw window). */
export function floatingDialogSafeCenterOffset(
  insets: FloatingDialogViewportInsets,
): FloatingDialogOffset {
  return {
    x: Math.round((insets.left - insets.right) / 2),
    y: Math.round((insets.top - insets.bottom) / 2),
  };
}

/** Keep an anchored popover/menu inside the safe viewport rect. */
export function clampAnchoredMenuPosition(args: {
  left: number;
  top: number;
  menuWidth: number;
  menuHeight: number;
  windowWidth: number;
  windowHeight: number;
  insets: FloatingDialogViewportInsets;
}): { left: number; top: number } {
  const { menuWidth, menuHeight, windowWidth, windowHeight, insets } = args;
  const minLeft = insets.left;
  const maxLeft = windowWidth - insets.right - menuWidth;
  const minTop = insets.top;
  const maxTop = windowHeight - insets.bottom - menuHeight;
  let left = args.left;
  let top = args.top;
  if (maxLeft >= minLeft) {
    left = Math.min(maxLeft, Math.max(minLeft, left));
  } else {
    left = Math.round((insets.left + windowWidth - insets.right - menuWidth) / 2);
  }
  if (maxTop >= minTop) {
    top = Math.min(maxTop, Math.max(minTop, top));
  } else {
    top = Math.round((insets.top + windowHeight - insets.bottom - menuHeight) / 2);
  }
  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * Resize from a pointer delta while pinning the opposite edge(s).
 * Sheet is center-anchored + offset, so west/north growth must shift offset.
 */
export function applyIndependentEdgeResize(args: {
  handle: FloatingDialogResizeHandle;
  startSize: FloatingDialogSize;
  startOffset: FloatingDialogOffset;
  dx: number;
  dy: number;
  clampSize: (size: FloatingDialogSize) => FloatingDialogSize;
}): { size: FloatingDialogSize; offset: FloatingDialogOffset } {
  const edges = edgesForFloatingDialogHandle(args.handle);
  let nextWidth = args.startSize.width;
  let nextHeight = args.startSize.height;
  if (edges.includes("e")) nextWidth = args.startSize.width + args.dx;
  if (edges.includes("w")) nextWidth = args.startSize.width - args.dx;
  if (edges.includes("s")) nextHeight = args.startSize.height + args.dy;
  if (edges.includes("n")) nextHeight = args.startSize.height - args.dy;

  const size = args.clampSize({ width: nextWidth, height: nextHeight });
  const dW = size.width - args.startSize.width;
  const dH = size.height - args.startSize.height;

  let x = args.startOffset.x;
  let y = args.startOffset.y;
  // Center-anchored: growing width alone moves both sides by dW/2.
  // West resize should pin the east edge → shift center left by full dW when growing west.
  if (edges.includes("w") && !edges.includes("e")) {
    x = args.startOffset.x - dW / 2;
  } else if (edges.includes("e") && !edges.includes("w")) {
    x = args.startOffset.x + dW / 2;
  }
  if (edges.includes("n") && !edges.includes("s")) {
    y = args.startOffset.y - dH / 2;
  } else if (edges.includes("s") && !edges.includes("n")) {
    y = args.startOffset.y + dH / 2;
  }

  return { size, offset: { x: Math.round(x), y: Math.round(y) } };
}

export function readFloatingDialogStoredSize(key: string): FloatingDialogSize | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width = Number(parsed.width);
    const height = Number(parsed.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width: Math.round(width), height: Math.round(height) };
  } catch {
    return null;
  }
}

export function writeFloatingDialogStoredSize(key: string, size: FloatingDialogSize): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(size));
  } catch {
    // ignore quota / private mode
  }
}

export function readFloatingDialogStoredOffset(key: string): FloatingDialogOffset | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
  } catch {
    return null;
  }
}

export function writeFloatingDialogStoredOffset(
  key: string,
  offset: FloatingDialogOffset,
): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(offset));
  } catch {
    // ignore
  }
}

/** Fired when a floating sheet’s translate/size changes (ResizeObserver misses CSS transform moves). */
export const HSP_FLOATING_DIALOG_GEOMETRY_EVENT = "hsp-floating-dialog-geometry";

/**
 * Notify fixed scroll thumbs to remeasure.
 * Dispatches on `window` — listeners attach there; non-bubbling `document` events never reach them.
 */
export function notifyFloatingDialogGeometryChanged(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HSP_FLOATING_DIALOG_GEOMETRY_EVENT));
}
