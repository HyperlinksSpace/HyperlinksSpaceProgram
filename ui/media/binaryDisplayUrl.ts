import { isDesktopAppShell } from "../appShell";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Expo Image on Electron `app://` cannot load `blob:app://…` object URLs — use data URLs. */
export async function cacheableDisplayUrlFromBlob(
  blob: Blob,
  mime: string | null | undefined,
): Promise<string> {
  const type = (mime || blob.type || "application/octet-stream").split(";")[0]?.trim() || "application/octet-stream";
  if (isDesktopAppShell()) {
    const buffer = await blob.arrayBuffer();
    return `data:${type};base64,${arrayBufferToBase64(buffer)}`;
  }
  if (type && blob.type !== type) {
    const buffer = await blob.arrayBuffer();
    return URL.createObjectURL(new Blob([buffer], { type }));
  }
  return URL.createObjectURL(blob);
}

export function revokeDisplayUrlIfObjectUrl(url: string | null | undefined): void {
  if (!url || !url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}
