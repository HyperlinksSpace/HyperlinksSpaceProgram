import { loadTgsAnimationFromBytes } from "./loadTgsAnimation";

const STATUS_TGS_URL = "/status.tgs";

let cachedAnimation: object | null = null;
let loadPromise: Promise<object> | null = null;

/** Telegram `.tgs` (gzip Lottie JSON) → animation object for TgsCanvasPlayer. */
export async function loadStatusTgsAnimation(): Promise<object> {
  if (cachedAnimation) return cachedAnimation;
  if (!loadPromise) {
    loadPromise = (async () => {
      const response = await fetch(STATUS_TGS_URL);
      if (!response.ok) {
        throw new Error(`status.tgs fetch failed: ${response.status}`);
      }
      const compressed = new Uint8Array(await response.arrayBuffer());
      cachedAnimation = await loadTgsAnimationFromBytes(compressed);
      return cachedAnimation;
    })();
  }
  return loadPromise;
}
