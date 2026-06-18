import { Platform } from "react-native";
import type { MtprotoAuthMethod, MtprotoAuthState } from "./TelegramMessagesConnectionContext";

const STORAGE_KEY = "hsp_mtproto_connect_v1";

export type StoredMtprotoConnect = {
  attemptId: string | null;
  authState: MtprotoAuthState;
  authMethod: MtprotoAuthMethod;
};

export function readStoredMtprotoConnect(): StoredMtprotoConnect | null {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredMtprotoConnect;
  } catch {
    return null;
  }
}

export function writeStoredMtprotoConnect(data: StoredMtprotoConnect): void {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredMtprotoConnect(): void {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
