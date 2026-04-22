import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

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

function stringifyForConsole(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "[page-display] stringify failed";
    }
  }
}

export function logPageDisplay(
  event: string,
  details?: Record<string, unknown>,
): void {
  const line = {
    event,
    ...details,
  };
  // One string so minified builds / collapsed DevTools still show payload (not only "Object").
  // eslint-disable-next-line no-console
  console.log(`${PAGE_DISPLAY_LOG_PREFIX} ${stringifyForConsole(line)}`);
}

export function logBuildSnapshotOnce(reason: string): void {
  const snap = getBuildDisplaySnapshot();
  logPageDisplay("build_snapshot", {
    reason,
    ...snap,
  });
}
