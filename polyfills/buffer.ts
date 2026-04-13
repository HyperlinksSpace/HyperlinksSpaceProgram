/**
 * Load before any module that touches Node's `Buffer` at evaluation time (e.g. @ton/*).
 * Browsers and Telegram WebView do not define `globalThis.Buffer`.
 *
 * Hermes / RN: `Buffer.prototype.subarray` can follow `Uint8Array` and return a slice
 * without `.copy()`. `@ton/core` BitBuilder.buffer() does `this._buffer.subarray(...).copy(...)`.
 * Always return a real `buffer` package Buffer from subarray.
 */
import { Buffer } from "buffer";

const BufferImpl = Buffer;
const uint8Subarray = Uint8Array.prototype.subarray;

if (typeof globalThis !== "undefined") {
  (globalThis as { Buffer: typeof BufferImpl }).Buffer = BufferImpl;

  BufferImpl.prototype.subarray = function subarrayPatched(
    this: Buffer,
    start?: number,
    end?: number,
  ): Buffer {
    const slice = uint8Subarray.call(this, start, end);
    return BufferImpl.from(slice);
  };
}
