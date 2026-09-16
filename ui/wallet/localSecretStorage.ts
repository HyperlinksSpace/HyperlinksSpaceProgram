/**
 * Platform-aware on-device secret storage for imported-wallet seeds.
 * Never uploads mnemonics — only local ciphertext / OS keychain material.
 *
 * Strategy:
 * - iOS / Android: expo-secure-store (Keychain / Keystore) when available
 * - Browser / Electron / fallback: localStorage (app layer still AES-GCM encrypts)
 */

import { Platform } from "react-native";

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

let secureStore: SecureStoreModule | null | undefined;

function loadSecureStore(): SecureStoreModule | null {
  if (secureStore !== undefined) return secureStore;
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    secureStore = null;
    return null;
  }
  try {
    // Optional peer — web/Electron builds must not hard-fail without it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require("expo-secure-store") as SecureStoreModule;
  } catch {
    secureStore = null;
  }
  return secureStore;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export async function readLocalSecret(key: string): Promise<string | null> {
  const ss = loadSecureStore();
  if (ss) {
    try {
      return await ss.getItemAsync(key);
    } catch {
      /* fall through */
    }
  }
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeLocalSecret(key: string, value: string): Promise<void> {
  const ss = loadSecureStore();
  if (ss) {
    try {
      await ss.setItemAsync(key, value);
      return;
    } catch {
      /* fall through */
    }
  }
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

export async function deleteLocalSecret(key: string): Promise<void> {
  const ss = loadSecureStore();
  if (ss) {
    try {
      await ss.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  }
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Sync helpers for list metadata that already lived in localStorage (non-secret rows). */
export function readLocalJsonSync(key: string): string | null {
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalJsonSync(key: string, value: string): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
