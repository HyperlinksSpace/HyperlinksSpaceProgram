import * as Linking from "expo-linking";

/**
 * Open an https URL for OAuth / external auth. In a normal browser tab we navigate in-place;
 * in Electron (`app://`) or other non-http shells we prefer a new window or the OS handler.
 */
export async function openExternalAuthUrl(url: string): Promise<void> {
  if (typeof window !== "undefined") {
    const origin = window.location?.origin ?? "";
    const pageIsHttp = origin.startsWith("http://") || origin.startsWith("https://");
    if (pageIsHttp && typeof window.location.assign === "function") {
      window.location.assign(url);
      return;
    }
    if (typeof window.open === "function") {
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (popup) return;
    }
  }
  await Linking.openURL(url);
}
