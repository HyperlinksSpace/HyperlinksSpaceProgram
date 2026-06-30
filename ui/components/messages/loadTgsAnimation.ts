import { inflate } from "pako";

/** Telegram `.tgs` (gzip Lottie JSON) → animation object for TgsCanvasPlayer. */
export async function loadTgsAnimationFromBytes(compressed: Uint8Array): Promise<object> {
  const json = new TextDecoder().decode(inflate(compressed));
  return JSON.parse(json) as object;
}

export function bytesLookLikeTgs(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

export function bytesLookLikeVideo(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return true;
  if (data.length >= 8) {
    const ftyp = String.fromCharCode(data[4]!, data[5]!, data[6]!, data[7]!);
    if (ftyp === "ftyp") return true;
  }
  return false;
}
