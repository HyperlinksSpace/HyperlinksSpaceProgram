/**
 * Load before any module that touches Node's `Buffer` at evaluation time (e.g. @ton/*).
 * Browsers and Telegram WebView do not define `globalThis.Buffer`.
 */
import { Buffer } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}
