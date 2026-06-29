import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { appLog, safeTelegramUserIdForLog, telegramUserIdLogField } from "../shared/appLog";

/** Console prefix — filter devtools with `[page-display]`. */
export const PAGE_DISPLAY_LOG_PREFIX = "[page-display]";

export type BuildDisplaySnapshot = {
  platform: typeof Platform.OS;
  /** App version from Expo config / native bundle when present. */
  appVersion: string | null;
  nativeBuildVersion: string | null;
  /** Whether expo-updates is active (false in many dev / web cases). */
  updatesEnabled: boolean | null;
  /** OTA / runtime (native + some web builds). */
  runtimeVersion: string | null;
  updateId: string | null;
  channel: string | null;
  isEmbeddedLaunch: boolean | null;
  isEmergencyLaunch: boolean | null;
  createdAt: string | null;
};

let cachedSnapshot: BuildDisplaySnapshot | null = null;

/** Best-effort bundle + OTA identity for correlating which JS/assets are running. */
export function getBuildDisplaySnapshot(): BuildDisplaySnapshot {
  if (cachedSnapshot) return cachedSnapshot;

  let appVersion: string | null =
    (Constants.expoConfig?.version as string | undefined) ?? null;
  if (!appVersion && typeof Constants.nativeAppVersion === "string") {
    appVersion = Constants.nativeAppVersion;
  }

  const nativeBuildVersion =
    typeof Constants.nativeBuildVersion === "string" ? Constants.nativeBuildVersion : null;

  let updatesEnabled: boolean | null = null;
  let runtimeVersion: string | null = null;
  let updateId: string | null = null;
  let channel: string | null = null;
  let isEmbeddedLaunch: boolean | null = null;
  let isEmergencyLaunch: boolean | null = null;
  let createdAt: string | null = null;

  try {
    updatesEnabled = Updates.isEnabled;
    runtimeVersion = Updates.runtimeVersion ?? null;
    updateId = Updates.updateId ?? null;
    channel = Updates.channel ?? null;
    isEmbeddedLaunch = Updates.isEmbeddedLaunch;
    isEmergencyLaunch = Updates.isEmergencyLaunch;
    createdAt = Updates.createdAt ? Updates.createdAt.toISOString() : null;
  } catch {
    // expo-updates unavailable (e.g. some web dev paths)
  }

  cachedSnapshot = {
    platform: Platform.OS,
    appVersion,
    nativeBuildVersion,
    updatesEnabled,
    runtimeVersion,
    updateId,
    channel,
    isEmbeddedLaunch,
    isEmergencyLaunch,
    createdAt,
  };
  return cachedSnapshot;
}

export function logPageDisplay(
  event: string,
  details?: Record<string, unknown>,
): void {
  appLog(PAGE_DISPLAY_LOG_PREFIX, event, details);
}

/** chatId + optional peer userId (+ title for grep) — Telegram ids only, no secrets. */
export function chatLogFields(input: {
  chatId?: number | null;
  peerUserId?: number | null;
  title?: string | null;
  userIdKey?: string;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const chatId = Number(input.chatId);
  if (Number.isFinite(chatId) && chatId !== 0) fields.chatId = Math.trunc(chatId);
  Object.assign(fields, telegramUserIdLogField(input.peerUserId, input.userIdKey ?? "userId"));
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title) fields.title = title;
  return fields;
}

export function firstChatListLogFields(
  rows: ReadonlyArray<{ telegram_chat_id: number; peer_user_id?: number | null; title?: string }>,
): Record<string, unknown> {
  const first = rows[0];
  if (!first) return {};
  const fields: Record<string, unknown> = {
    firstId: first.telegram_chat_id,
  };
  const firstUserId = safeTelegramUserIdForLog(first.peer_user_id);
  if (firstUserId != null) fields.firstUserId = firstUserId;
  const title = typeof first.title === "string" ? first.title.trim() : "";
  if (title) fields.firstTitle = title;
  return fields;
}

export function logBuildSnapshotOnce(reason: string): void {
  const snap = getBuildDisplaySnapshot();
  logPageDisplay("build_snapshot", {
    reason,
    ...snap,
  });
}
