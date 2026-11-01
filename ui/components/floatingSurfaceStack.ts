/**
 * Shared stacking order for floating UI (dialogs, side menu).
 * Click / open raises that surface above siblings — Telegram Desktop / OS window behavior.
 */

export const FLOATING_SURFACE_BASE_Z = 10050;
const FLOATING_SURFACE_Z_STEP = 10;

let topZ = FLOATING_SURFACE_BASE_Z;
const zById = new Map<string, number>();
let seq = 0;

export function allocateFloatingSurfaceId(prefix = "float"): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function peekFloatingSurfaceZ(id: string): number {
  return zById.get(id) ?? FLOATING_SURFACE_BASE_Z;
}

/** Highest z currently assigned to any floating surface (dialogs, menus). */
export function peekTopFloatingSurfaceZ(): number {
  return topZ;
}

/** Register a surface; returns its initial z-index (already on top). */
export function registerFloatingSurface(id: string, minZ = FLOATING_SURFACE_BASE_Z): number {
  topZ = Math.max(topZ, minZ) + FLOATING_SURFACE_Z_STEP;
  zById.set(id, topZ);
  return topZ;
}

export function unregisterFloatingSurface(id: string): void {
  zById.delete(id);
}

/** Raise this surface above all other registered floating surfaces. */
export function bringFloatingSurfaceToFront(id: string, minZ = FLOATING_SURFACE_BASE_Z): number {
  if (!zById.has(id)) {
    return registerFloatingSurface(id, minZ);
  }
  const current = zById.get(id) ?? FLOATING_SURFACE_BASE_Z;
  if (current >= topZ && current >= minZ) {
    return current;
  }
  topZ = Math.max(topZ, minZ, current) + FLOATING_SURFACE_Z_STEP;
  zById.set(id, topZ);
  return topZ;
}

/** Scroll thumbs portaled to `document.body` must stay within their dialog’s stack band. */
export function floatingDialogScrollIndicatorZ(dialogStackZ: number): number {
  return dialogStackZ + 1;
}

const FLOATING_STACK_Z_DATA_ATTR = "data-hsp-floating-stack-z";

/** Read stack z from a dialog sheet/body node (set on {@link FloatingDialogShell} portal root). */
export function readFloatingDialogStackZFromElement(start: Element | null): number | null {
  if (!start || typeof (start as Element).closest !== "function") return null;
  let el: Element | null = start;
  while (el) {
    const raw =
      el.getAttribute(FLOATING_STACK_Z_DATA_ATTR) ??
      (el as HTMLElement).dataset?.hspFloatingStackZ ??
      null;
    if (raw) {
      const n = parseInt(String(raw), 10);
      if (Number.isFinite(n)) return n;
    }
    el = el.parentElement;
  }
  return null;
}

export { FLOATING_STACK_Z_DATA_ATTR };
