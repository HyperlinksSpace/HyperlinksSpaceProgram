import { inflate } from "pako";

const STATUS_TGS_URL = "/status.tgs";

let cachedAnimation: object | null = null;
let loadPromise: Promise<object> | null = null;

/** Telegram `.tgs` (gzip Lottie JSON) → animation object for lottie-react. */
export async function loadStatusTgsAnimation(): Promise<object> {
  if (cachedAnimation) return cachedAnimation;
  if (!loadPromise) {
    loadPromise = (async () => {
      const response = await fetch(STATUS_TGS_URL);
      if (!response.ok) {
        throw new Error(`status.tgs fetch failed: ${response.status}`);
      }
      const compressed = new Uint8Array(await response.arrayBuffer());
      const json = new TextDecoder().decode(inflate(compressed));
      cachedAnimation = JSON.parse(json) as object;
      return cachedAnimation;
    })();
  }
  return loadPromise;
}
