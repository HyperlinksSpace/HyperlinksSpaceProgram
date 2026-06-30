import { loadTgsAnimationFromBytes } from "./loadTgsAnimation";

const parsedJsonCache = new Map<string, object>();
const inflightJson = new Map<string, Promise<object>>();

function bytesCacheKey(bytes: Uint8Array): string {
  const len = bytes.length;
  if (len <= 64) {
    return `bytes:${Array.from(bytes).join(",")}`;
  }
  const head = Array.from(bytes.subarray(0, 32)).join(",");
  const tail = Array.from(bytes.subarray(len - 32)).join(",");
  return `bytes:${len}:${head}:${tail}`;
}

/** Cache decompressed TGS → Lottie JSON (telegram-tt caches sticker payloads similarly). */
export async function getCachedTgsAnimationData(
  key: string,
  loader: () => Promise<object>,
): Promise<object> {
  const hit = parsedJsonCache.get(key);
  if (hit) return hit;

  const pending = inflightJson.get(key);
  if (pending) return pending;

  const promise = loader()
    .then((data) => {
      parsedJsonCache.set(key, data);
      inflightJson.delete(key);
      return data;
    })
    .catch((err) => {
      inflightJson.delete(key);
      throw err;
    });
  inflightJson.set(key, promise);
  return promise;
}

export async function getCachedTgsAnimationFromBytes(bytes: Uint8Array): Promise<object> {
  return getCachedTgsAnimationData(bytesCacheKey(bytes), () => loadTgsAnimationFromBytes(bytes));
}

export async function getCachedTgsAnimationByKey(
  key: string,
  loader: () => Promise<object>,
): Promise<object> {
  return getCachedTgsAnimationData(key, loader);
}
