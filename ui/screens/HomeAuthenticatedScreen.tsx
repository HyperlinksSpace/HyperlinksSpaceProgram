import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Button, Text, View } from "react-native";
import { Address } from "@ton/core";
import { type TelegramWalletRow, useTelegram } from "../components/Telegram";
import { logPageDisplay } from "../pageDisplayLog";
import { useColors } from "../theme";
import { buildApiUrl } from "../../api/_base";
import {
  createSeedCipher,
  deriveAddressFromMnemonic,
  deriveMasterKeyFromMnemonic,
  generateMnemonic,
} from "../../services/wallet/tonWallet";

/**
 * Survives React Strict Mode / remount: component `useRef` resets, but two parallel
 * `createAndRegisterWalletFlow` calls still produced duplicate pre-register + `POST /api/wallet/register`
 * and stuck loading (TMA / production logs showed doubled `pre_register_done` + `register_fetch`).
 */
let walletCreateModuleInFlight = false;

function isWalletCreateFlowModuleLocked() {
  return walletCreateModuleInFlight;
}

/**
 * Provisional UI state set from async code must survive **React 18 Strict Mode remounts** and TMA
 * re-mounts. If the first `HomeAuthenticatedScreen` instance is torn down after `useLayoutEffect`
 * started `createAndRegisterWalletFlow` but before `setCreatedWalletAddress` runs, those `setState`
 * calls are dropped; the in-flight IIFE (module lock) then logs `local_wallet_address_ready` with no
 * visible address. A module store + `useSyncExternalStore` re-renders the **current** instance.
 */
type WalletHomeBootstrap = {
  provisionalAddress: string | null;
  serverRegPending: boolean;
};
let homeBootstrap: WalletHomeBootstrap = {
  provisionalAddress: null,
  serverRegPending: false,
};
let homeBootstrapVersion = 0;
const homeBootstrapListeners = new Set<() => void>();
function getHomeBootstrapVersion() {
  return homeBootstrapVersion;
}
function subscribeHomeBootstrap(on: () => void) {
  homeBootstrapListeners.add(on);
  return () => {
    homeBootstrapListeners.delete(on);
  };
}
function getHomeBootstrap(): WalletHomeBootstrap {
  return homeBootstrap;
}
function setHomeBootstrap(patch: Partial<WalletHomeBootstrap>) {
  const next: WalletHomeBootstrap = { ...homeBootstrap, ...patch };
  if (
    next.provisionalAddress === homeBootstrap.provisionalAddress &&
    next.serverRegPending === homeBootstrap.serverRegPending
  ) {
    return;
  }
  homeBootstrap = next;
  homeBootstrapVersion += 1;
  for (const l of homeBootstrapListeners) l();
}

/** Authenticated “home” main view; mounted from `app/index` at URL `/` when the user has a session. */

type CreateStep = "idle" | "saving" | "done";

type TelegramWebAppBridge = {
  SecureStorage?: {
    setItem?: (key: string, value: string, callback?: (err: unknown, stored?: boolean) => void) => void;
  };
  DeviceStorage?: {
    setItem?: (key: string, value: string, callback?: (err: unknown, stored?: boolean) => void) => void;
  };
  CloudStorage?: {
    setItem?: (key: string, value: string, callback?: (err: unknown, stored?: boolean) => void) => void;
  };
  onEvent?: (eventType: string, callback: (...args: unknown[]) => void) => void;
  offEvent?: (eventType: string, callback: (...args: unknown[]) => void) => void;
};

function getTelegramWebApp(): TelegramWebAppBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebAppBridge } }).Telegram?.WebApp;
}

/**
 * SecureStorage.setItem: on error the first callback argument is the error; on success it is null
 * and the second is whether the value was stored. Some clients also emit web events; see
 * https://core.telegram.org/bots/webapps#securestorage
 */
async function setTmaSecureStorageItem(key: string, value: string): Promise<boolean> {
  const webApp = getTelegramWebApp();
  if (!webApp) return false;
  const storage = webApp.SecureStorage;
  const setItem = storage?.setItem;
  if (typeof setItem !== "function") return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    const onSecureStorageFailed = (payload?: unknown) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[wallet] secure_storage_failed", payload);
      }
      finish(false);
    };

    /** Fired when a value was saved (bridge may deliver this if the JS callback is delayed). */
    const onSecureStorageKeySaved = () => {
      finish(true);
    };

    const cleanup = () => {
      try {
        webApp.offEvent?.("secure_storage_failed", onSecureStorageFailed);
      } catch {
        /* ignore */
      }
      try {
        webApp.offEvent?.("secure_storage_key_saved", onSecureStorageKeySaved);
      } catch {
        /* ignore */
      }
    };

    try {
      webApp.onEvent?.("secure_storage_failed", onSecureStorageFailed);
      webApp.onEvent?.("secure_storage_key_saved", onSecureStorageKeySaved);
    } catch {
      /* older clients */
    }

    try {
      setItem(key, value, (err: unknown, stored?: boolean) => {
        if (err != null) {
          finish(false);
          return;
        }
        finish(stored !== false);
      });
    } catch {
      cleanup();
      resolve(false);
    }
  });
}

/**
 * DeviceStorage: persistent local KV inside the Telegram client (not Keychain/Keystore).
 * Same callback shape as SecureStorage; some clients emit device_storage_* web events.
 * @see https://core.telegram.org/bots/webapps#devicestorage
 */
async function setTmaDeviceStorageItem(key: string, value: string): Promise<boolean> {
  const webApp = getTelegramWebApp();
  if (!webApp) return false;
  const storage = webApp.DeviceStorage;
  const setItem = storage?.setItem;
  if (typeof setItem !== "function") return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    const onDeviceStorageFailed = (payload?: unknown) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[wallet] device_storage_failed", payload);
      }
      finish(false);
    };

    const onDeviceStorageKeySaved = () => {
      finish(true);
    };

    const cleanup = () => {
      try {
        webApp.offEvent?.("device_storage_failed", onDeviceStorageFailed);
      } catch {
        /* ignore */
      }
      try {
        webApp.offEvent?.("device_storage_key_saved", onDeviceStorageKeySaved);
      } catch {
        /* ignore */
      }
    };

    try {
      webApp.onEvent?.("device_storage_failed", onDeviceStorageFailed);
      webApp.onEvent?.("device_storage_key_saved", onDeviceStorageKeySaved);
    } catch {
      /* older clients */
    }

    try {
      setItem(key, value, (err: unknown, stored?: boolean) => {
        if (err != null) {
          finish(false);
          return;
        }
        finish(stored !== false);
      });
    } catch {
      cleanup();
      resolve(false);
    }
  });
}

export type WalletMasterKeyStorageTier = "secure" | "device" | "none";

/**
 * Prefer hardware-backed SecureStorage; if missing or UNSUPPORTED, fall back to DeviceStorage
 * so Desktop and older clients can still persist the key (weaker — see docs/security_raw.md).
 */
async function persistWalletMasterKey(masterKey: string): Promise<WalletMasterKeyStorageTier> {
  const okSecure = await setTmaSecureStorageItem("wallet_master_key", masterKey);
  if (okSecure) return "secure";

  const okDevice = await setTmaDeviceStorageItem("wallet_master_key", masterKey);
  if (okDevice) return "device";

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[wallet] wallet_master_key not persisted (no SecureStorage nor DeviceStorage)");
  }
  return "none";
}

/**
 * Some Telegram Desktop TMA builds never invoke Storage callback bridges; unbounded `await` leaves
 * "Preparing your wallet" forever. Prefer completing registration (wallet row exists server-side).
 */
const TMA_STORAGE_MAX_WAIT_MS = 25_000;
/** Serverless/cold DB can exceed 45s; client abort must not cut off a slow but successful register. */
const WALLET_REGISTER_TIMEOUT_MS = 90_000;
/** TMA: `POST /api/wallet/register` may never resolve even when the server wrote the row; poll `/api/wallet/status` in parallel. */
const WALLET_REGISTER_POLL_INTERVAL_MS = 2_000;
const WALLET_REGISTER_STATUS_FETCH_MS = 8_000;
/** Vercel 502/503/504: Lambda may be killed before the response while DB commit still completes. */
const REGISTER_AFTER_GATEWAY_POLL_BUDGET_MS = 120_000;
/**
 * `POST /api/wallet/status` is cheap. If the first register 504d **before** any DB write, status stays
 * empty forever — the UI must re-`POST /api/wallet/register` (idempotent `ON CONFLICT` upsert) on a
 * slower cadence. Interval = ticks × `WALLET_REGISTER_POLL_INTERVAL_MS` (2s per tick).
 */
const SIDE_REGISTER_RETRY_INTERVAL_TICKS = 5;
const SIDE_REGISTER_POST_TIMEOUT_MS = 90_000;
/** Mnemonic + address + key derivation; some TMA WebViews hang in WebCrypto without rejecting. */
const WALLET_PRE_REGISTER_TIMEOUT_MS = 30_000;
/** Covers pre-register (≤30s) + register race (≤90s) + gateway status recovery (≤120s) + slack. */
const WALLET_FLOW_BUDGET_MS = 250_000;

/**
 * If `POST /api/wallet/register` times out (504) or the network blips, the server row may still appear
 * shortly after. The home `useEffect` polls `POST /api/wallet/status` only while `serverRegPending` is
 * true — we must not clear that flag on these errors or "Finishing on the server" never completes.
 */
function isRetryableRegistrationError(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false;
  }
  const m = e.message;
  if (m.includes("Wallet server timed out") || m.includes("busy or cold")) {
    return true;
  }
  if (m.includes("Wallet registration: could not reach the app or the server in time")) {
    return true;
  }
  if (m.includes("Wallet registration request timed out") || m.includes("Wallet registration request failed")) {
    return true;
  }
  if (m.includes("Network request failed") || m.includes("Failed to fetch") || m.toLowerCase().includes("load failed")) {
    return true;
  }
  return false;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const f =
    typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis) as typeof fetch
      : fetch;
  const controller = new AbortController();
  return new Promise<Response>((resolve, reject) => {
    const hardFuse = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
      reject(new Error("Wallet registration request timed out"));
    }, timeoutMs);
    void f(url, { ...init, signal: controller.signal }).then(
      (response) => {
        clearTimeout(hardFuse);
        resolve(response);
      },
      (e) => {
        clearTimeout(hardFuse);
        if (e instanceof Error && e.name === "AbortError") {
          reject(new Error("Wallet registration request timed out"));
        } else {
          reject(e);
        }
      },
    );
  });
}

/**
 * TON user-friendly forms can differ (e.g. bounceable `EQ` vs non-`UQ` for the same v4 key). String
 * compare and naive lowercasing are unsafe; `Address.equals` normalizes the underlying cell.
 */
function sameTonAddressForPoll(a: string, b: string): boolean {
  const x = a.replace(/\s+/g, "").trim();
  const y = b.replace(/\s+/g, "").trim();
  if (x === y) {
    return true;
  }
  try {
    return Address.parse(x).equals(Address.parse(y));
  } catch {
    return x.toLowerCase() === y.toLowerCase();
  }
}

/**
 * `POST /api/wallet/status` — same initData as register; use to detect a wallet the server
 * already stored when the register `fetch` is stuck in Telegram WebView.
 */
async function fetchDefaultWalletStatusRow(
  initData: string,
  timeoutMs: number,
): Promise<TelegramWalletRow | null> {
  try {
    const r = await fetchWithTimeout(
      buildApiUrl("/api/wallet/status"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ initData }),
      },
      timeoutMs,
    );
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      has_wallet?: boolean;
      wallet?: unknown;
    };
    if (!r.ok || !j?.ok || !j?.has_wallet || !j?.wallet) {
      return null;
    }
    return registerWalletFromJson(j.wallet);
  } catch {
    return null;
  }
}

/** After `POST /api/wallet/register` returns 502/503/504, keep matching the status endpoint. */
async function tryRecoverAfterRegisterGatewayError(
  initData: string,
  expectedWalletAddress: string,
): Promise<TelegramWalletRow | null> {
  const matchExpected = (row: TelegramWalletRow) =>
    sameTonAddressForPoll(row.wallet_address, expectedWalletAddress);
  const deadline = Date.now() + REGISTER_AFTER_GATEWAY_POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    const row = await fetchDefaultWalletStatusRow(initData, WALLET_REGISTER_STATUS_FETCH_MS);
    if (row && matchExpected(row)) {
      return row;
    }
    await new Promise((r) => setTimeout(r, WALLET_REGISTER_POLL_INTERVAL_MS));
  }
  return null;
}

type RegisterRaceOutcome =
  | { from: "fetch"; response: Response }
  | { from: "poll"; row: TelegramWalletRow };

/**
 * TMA: register `POST` and server-side confirmation race. Whichever indicates success first wins.
 * Poll only accepts a row whose `wallet_address` matches `expectedWalletAddress` (this flow’s key).
 */
function raceRegisterPostWithStatusPoll(
  registerUrl: string,
  registerInit: RequestInit,
  initData: string,
  expectedWalletAddress: string,
): Promise<RegisterRaceOutcome> {
  const matchExpected = (row: TelegramWalletRow) => sameTonAddressForPoll(row.wallet_address, expectedWalletAddress);

  return new Promise<RegisterRaceOutcome>((resolve, reject) => {
    let settled = false;
    const deadline = Date.now() + WALLET_REGISTER_TIMEOUT_MS;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let pollInFlight = false;

    const finish = (o: RegisterRaceOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
      resolve(o);
    };

    const fail = (e: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
      reject(e);
    };

    void fetchWithTimeout(registerUrl, registerInit, WALLET_REGISTER_TIMEOUT_MS).then(
      (response) => {
        if (settled) {
          return;
        }
        finish({ from: "fetch", response });
      },
      (e) => {
        fail(e instanceof Error ? e : new Error("Wallet registration request failed"));
      },
    );

    const pollOnce = async () => {
      if (settled) {
        return;
      }
      if (Date.now() > deadline) {
        fail(
          new Error(
            "Wallet registration: could not reach the app or the server in time. Try again, or open the app once more (your wallet may already be saved).",
          ),
        );
        return;
      }
      if (pollInFlight) {
        return;
      }
      pollInFlight = true;
      try {
        const row = await fetchDefaultWalletStatusRow(initData, WALLET_REGISTER_STATUS_FETCH_MS);
        if (settled) {
          return;
        }
        if (row && matchExpected(row)) {
          logPageDisplay("wallet_create_flow", { flow: "register_detected_via_status_poll" });
          finish({ from: "poll", row });
        }
      } finally {
        pollInFlight = false;
      }
    };

    void pollOnce();
    intervalId = setInterval(() => {
      void pollOnce();
    }, WALLET_REGISTER_POLL_INTERVAL_MS);
  });
}

function promiseWithTimeout<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn(`[wallet] ${label} timed out after ${ms}ms, using fallback`);
      }
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** CloudStorage.setItem uses the same callback shape as SecureStorage. */
function registerWalletFromJson(raw: unknown): TelegramWalletRow | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const idRaw = w.id;
  const id =
    typeof idRaw === "number" && Number.isFinite(idRaw)
      ? idRaw
      : typeof idRaw === "string" && /^\d+$/.test(idRaw)
        ? Number(idRaw)
        : NaN;
  if (
    !Number.isFinite(id) ||
    typeof w.wallet_address !== "string" ||
    typeof w.wallet_blockchain !== "string" ||
    typeof w.wallet_net !== "string" ||
    typeof w.type !== "string"
  ) {
    return null;
  }
  return {
    id,
    wallet_address: w.wallet_address,
    wallet_blockchain: w.wallet_blockchain,
    wallet_net: w.wallet_net,
    type: w.type,
    label: w.label == null || typeof w.label === "string" ? (w.label as string | null) : null,
    is_default: Boolean(w.is_default),
    source: w.source == null || typeof w.source === "string" ? (w.source as string | null) : null,
  };
}

async function setTmaCloudStorageItem(key: string, value: string): Promise<boolean> {
  const webApp = getTelegramWebApp();
  const storage = webApp?.CloudStorage;
  const setItem = storage?.setItem;
  if (typeof setItem !== "function") return false;

  return new Promise<boolean>((resolve) => {
    try {
      setItem(key, value, (err: unknown, stored?: boolean) => {
        if (err != null) {
          resolve(false);
          return;
        }
        resolve(stored !== false);
      });
    } catch {
      resolve(false);
    }
  });
}

type PendingServerWalletRegPayload = {
  initData: string;
  walletAddress: string;
  mnemonic: string[];
  masterKey: string;
  registerUrl: string;
  registerInit: RequestInit;
  registerBody: string;
};

/**
 * Mirrors `pendingServerRegRef` for the in-flight create flow. Refs reset on remount; the
 * `await executeWalletServerRegistration` + inner status poll can stay wedged in a no-longer-active
 * instance, so the UI `serverRegPending` flag never clears. Module copy lets the *current* instance
 * poll `POST /api/wallet/status` and finish when the server row exists.
 */
let pendingServerRegModule: PendingServerWalletRegPayload | null = null;
let lastKeyBackgroundForWalletAddress: string | null = null;

function setPendingServerRegModuleStore(p: PendingServerWalletRegPayload) {
  pendingServerRegModule = p;
}
function clearPendingServerRegModuleStore() {
  pendingServerRegModule = null;
}

/** Set when the home-side `POST /api/wallet/status` poll recovers; lets the outer `catch` ignore a late error from a wedged in-flight `execute`. */
let walletRegSatisfiedBySideStatusPoll = false;

type SetCreateStep = (s: CreateStep) => void;

/**
 * TMA: register race + response handling. Caller should show the local derived address in the UI
 * before awaiting this (provisional UX); this finishes server + React wallet row application.
 */
async function executeWalletServerRegistration(
  initData: string,
  walletAddress: string,
  registerUrl: string,
  registerInit: RequestInit,
  apply: (r: TelegramWalletRow) => void,
  setCreated: (a: string) => void,
  setStep: SetCreateStep,
): Promise<void> {
  logPageDisplay("wallet_create_flow", { flow: "register_fetch", transport: "fetch_plus_status_poll" });
  const first = await raceRegisterPostWithStatusPoll(registerUrl, registerInit, initData, walletAddress);

  if (first.from === "poll") {
    apply(first.row);
    setCreated(first.row.wallet_address);
    setStep("done");
    logPageDisplay("wallet_create_flow", { flow: "register_ok", hasServerWallet: true, via: "status_poll" });
  } else {
    const response = first.response;
    logPageDisplay("wallet_create_flow", { flow: "register_response", httpStatus: response.status });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
      const errStr = json?.error != null ? String(json.error) : null;
      logPageDisplay("wallet_create_flow", { flow: "register_rejected", status: response.status, err: errStr });
      const gateway = response.status >= 502 && response.status <= 504;
      if (gateway) {
        logPageDisplay("wallet_create_flow", { flow: "register_retry_status_after_gateway", status: response.status });
        const recovered = await tryRecoverAfterRegisterGatewayError(
          typeof initData === "string" ? initData : "",
          walletAddress,
        );
        if (recovered) {
          apply(recovered);
          setCreated(recovered.wallet_address);
          setStep("done");
          logPageDisplay("wallet_create_flow", { flow: "register_ok", hasServerWallet: true, via: "status_after_gateway" });
        } else {
          const msg =
            errStr || "Wallet server timed out (busy or cold). Tap Retry, or try again in a few seconds.";
          throw new Error(msg);
        }
      } else {
        throw new Error(errStr || `HTTP ${response.status}`);
      }
    } else {
      const serverWallet = registerWalletFromJson(json.wallet);
      if (serverWallet) {
        apply(serverWallet);
      }
      setCreated(walletAddress);
      setStep("done");
      logPageDisplay("wallet_create_flow", { flow: "register_ok", hasServerWallet: Boolean(serverWallet), via: "register_post" });
    }
  }
}

function scheduleWalletKeyBackground(
  masterKey: string,
  mnemonic: string[],
  setMasterKeyStorageTier: (t: WalletMasterKeyStorageTier) => void,
  /** Deduplicate when both the in-flight IIFE and a UI-side status recovery call this for the same TON address. */
  dedupeByWalletAddress?: string,
): void {
  if (dedupeByWalletAddress != null && lastKeyBackgroundForWalletAddress === dedupeByWalletAddress) {
    return;
  }
  if (dedupeByWalletAddress != null) {
    lastKeyBackgroundForWalletAddress = dedupeByWalletAddress;
  }
  void (async () => {
    let seedCipher: string;
    try {
      seedCipher = await createSeedCipher(masterKey, mnemonic.join(" "));
    } catch (e) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[wallet] createSeedCipher failed in background", e);
      }
      try {
        const tier = await promiseWithTimeout(
          persistWalletMasterKey(masterKey),
          TMA_STORAGE_MAX_WAIT_MS,
          "none" as WalletMasterKeyStorageTier,
          "persistWalletMasterKey_cipher_fail",
        );
        setMasterKeyStorageTier(tier);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const [tier, cloudOk] = await Promise.all([
        promiseWithTimeout(
          persistWalletMasterKey(masterKey),
          TMA_STORAGE_MAX_WAIT_MS,
          "none" as WalletMasterKeyStorageTier,
          "persistWalletMasterKey",
        ),
        promiseWithTimeout(
          setTmaCloudStorageItem("wallet_seed_cipher", seedCipher),
          TMA_STORAGE_MAX_WAIT_MS,
          false,
          "setTmaCloudStorageItem",
        ),
      ]);
      setMasterKeyStorageTier(tier);
      if (!cloudOk && typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[wallet] wallet_seed_cipher not saved to CloudStorage");
      }
    } catch (e) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[wallet] background key/cloud persist failed", e);
      }
    }
  })();
}

export function HomeAuthenticatedScreen() {
  const colors = useColors();
  const {
    status,
    telegramUsername,
    hasWallet,
    walletRequired,
    wallet,
    initData,
    error,
    debug,
    applyServerWalletAfterRegister,
  } = useTelegram();
  const [step, setStep] = useState<CreateStep>("idle");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [createdWalletAddress, setCreatedWalletAddress] = useState<string | null>(null);
  const [masterKeyStorageTier, setMasterKeyStorageTier] = useState<WalletMasterKeyStorageTier | null>(null);
  /** After a provisional address + server error, offer "Retry server registration" (same keys) instead of a new mnemonic. */
  const [serverOnlyRetry, setServerOnlyRetry] = useState(false);
  const provisionalWalletVisibleRef = useRef(false);
  const pendingServerRegRef = useRef<PendingServerWalletRegPayload | null>(null);
  const homeBootstrapVersion = useSyncExternalStore(
    subscribeHomeBootstrap,
    getHomeBootstrapVersion,
    getHomeBootstrapVersion,
  );
  const { provisionalAddress: provFromModule, serverRegPending: isServerRegPendingFromModule } = getHomeBootstrap();
  const applyCreatedForRegister = useCallback((a: string) => {
    setHomeBootstrap({ provisionalAddress: a });
    setCreatedWalletAddress(a);
  }, []);
  const effectiveWalletAddress =
    wallet?.wallet_address ?? createdWalletAddress ?? provFromModule;
  void homeBootstrapVersion;
  /** True only when we can actually show a wallet string (avoids "has_wallet" with no row / stale flags). */
  const hasDisplayAddress = Boolean(effectiveWalletAddress);
  const effectiveHasWallet = hasWallet || hasDisplayAddress;
  const isBrowserSessionHydrating =
    status === "dev" &&
    !initData &&
    telegramUsername == null &&
    hasWallet == null &&
    wallet == null;
  const homePhase =
    status === "idle" || status === "loading" || isBrowserSessionHydrating
      ? "telegram_loading_or_polling"
      : status === "error"
        ? "telegram_error"
        : status === "dev"
          ? "telegram_dev_mode"
          : walletRequired && !hasDisplayAddress
            ? "wallet_setup"
            : "home_ready";

  const clearProvisionalRegistration = useCallback(() => {
    provisionalWalletVisibleRef.current = false;
    pendingServerRegRef.current = null;
    clearPendingServerRegModuleStore();
    setHomeBootstrap({ provisionalAddress: null, serverRegPending: false });
    setServerOnlyRetry(false);
  }, []);

  const createAndRegisterWalletFlow = useCallback(async () => {
    if (walletCreateModuleInFlight) {
      logPageDisplay("wallet_create_flow", { flow: "dedup_skip" });
      return;
    }
    if (!initData || (typeof initData === "string" && initData.trim() === "")) {
      setFlowError("Missing Telegram initData.");
      return;
    }
    walletCreateModuleInFlight = true;
    setFlowError(null);
    setServerOnlyRetry(false);
    lastKeyBackgroundForWalletAddress = null;
    walletRegSatisfiedBySideStatusPoll = false;
    setHomeBootstrap({ provisionalAddress: null, serverRegPending: false });
    setStep("saving");
    logPageDisplay("wallet_create_flow", { flow: "start" });
    let budgetTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const flowPromise = (async () => {
        const preRegTimeout = (label: string) =>
          new Promise<never>((_, r) => {
            setTimeout(
              () =>
                r(
                  new Error(
                    `${label} is taking too long. Update Telegram, try a different client, or tap Retry.`,
                  ),
                ),
              WALLET_PRE_REGISTER_TIMEOUT_MS,
            );
          });
        const { mnemonic, walletAddress, masterKey } = await Promise.race([
          (async () => {
            const mnemonic0 = await generateMnemonic();
            const wAddr = await deriveAddressFromMnemonic({ mnemonic: mnemonic0, testnet: false });
            const mKey = await deriveMasterKeyFromMnemonic(mnemonic0);
            return { mnemonic: mnemonic0, walletAddress: wAddr, masterKey: mKey };
          })(),
          preRegTimeout("Wallet key generation"),
        ]);
        logPageDisplay("wallet_create_flow", { flow: "pre_register_done" });
        // Register as soon as we have the address (do not await createSeedCipher first — WebCrypto
        // can stall indefinitely in some TMA WebViews, blocking the server round-trip).

        const registerBody = JSON.stringify({
          initData,
          wallet_address: walletAddress,
          wallet_blockchain: "ton",
          wallet_net: "mainnet",
          type: "internal",
          label: "Main wallet",
          source: "miniapp",
        });
        const registerUrl = buildApiUrl("/api/wallet/register");
        const registerInit: RequestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: registerBody,
        };

        const pendingPayload: PendingServerWalletRegPayload = {
          initData: initData as string,
          walletAddress,
          mnemonic,
          masterKey,
          registerUrl,
          registerInit,
          registerBody,
        };
        pendingServerRegRef.current = pendingPayload;
        setPendingServerRegModuleStore(pendingPayload);
        provisionalWalletVisibleRef.current = true;
        setHomeBootstrap({ provisionalAddress: walletAddress, serverRegPending: true });
        setCreatedWalletAddress(walletAddress);
        setStep("done");
        logPageDisplay("wallet_create_flow", { flow: "local_wallet_address_ready" });

        await executeWalletServerRegistration(
          initData as string,
          walletAddress,
          registerUrl,
          registerInit,
          applyServerWalletAfterRegister,
          applyCreatedForRegister,
          setStep,
        );
        walletRegSatisfiedBySideStatusPoll = false;
        provisionalWalletVisibleRef.current = false;
        pendingServerRegRef.current = null;
        clearPendingServerRegModuleStore();
        setHomeBootstrap({ serverRegPending: false });
        setServerOnlyRetry(false);

        scheduleWalletKeyBackground(masterKey, mnemonic, setMasterKeyStorageTier, walletAddress);
      })();

      const budgetP = new Promise<never>((_, r) => {
        budgetTimeoutId = setTimeout(() => {
          r(
            new Error(
              "Wallet setup is taking too long. Check your connection, update Telegram, or try again.",
            ),
          );
        }, WALLET_FLOW_BUDGET_MS);
      });
      try {
        await Promise.race([flowPromise, budgetP]);
      } finally {
        if (budgetTimeoutId !== undefined) {
          clearTimeout(budgetTimeoutId);
        }
      }
    } catch (e) {
      if (walletRegSatisfiedBySideStatusPoll) {
        walletRegSatisfiedBySideStatusPoll = false;
        logPageDisplay("wallet_create_flow", {
          flow: "flow_catch_ignored",
          reason: "register_already_satisfied_by_ui_status_poll",
          message: e instanceof Error ? e.message : String(e),
        });
      } else if (provisionalWalletVisibleRef.current && isRetryableRegistrationError(e)) {
        logPageDisplay("wallet_create_flow", {
          flow: "flow_catch_keep_pending",
          message: e instanceof Error ? e.message : String(e),
          reason: "side_status_poll_continues",
        });
        /* Keep `serverRegPending` + refs so the `useEffect` status poll can finish the row. */
      } else {
        logPageDisplay("wallet_create_flow", {
          flow: "flow_catch",
          message: e instanceof Error ? e.message : String(e),
        });
        setFlowError(e instanceof Error ? e.message : "Wallet registration failed");
        setHomeBootstrap({ serverRegPending: false });
        if (provisionalWalletVisibleRef.current) {
          setStep("done");
          setServerOnlyRetry(true);
        } else {
          setStep("idle");
          setServerOnlyRetry(false);
        }
      }
    } finally {
      walletCreateModuleInFlight = false;
    }
  }, [initData, applyServerWalletAfterRegister, applyCreatedForRegister]);

  const retryServerRegistrationOnly = useCallback(async () => {
    const p = pendingServerRegRef.current ?? pendingServerRegModule;
    if (!p) {
      void createAndRegisterWalletFlow();
      return;
    }
    if (walletCreateModuleInFlight) {
      logPageDisplay("wallet_create_flow", { flow: "retry_server_dedup_skip" });
      return;
    }
    walletCreateModuleInFlight = true;
    setFlowError(null);
    setHomeBootstrap({ serverRegPending: true });
    try {
      await executeWalletServerRegistration(
        p.initData,
        p.walletAddress,
        p.registerUrl,
        p.registerInit,
        applyServerWalletAfterRegister,
        applyCreatedForRegister,
        setStep,
      );
      scheduleWalletKeyBackground(p.masterKey, p.mnemonic, setMasterKeyStorageTier, p.walletAddress);
      clearProvisionalRegistration();
    } catch (e) {
      if (provisionalWalletVisibleRef.current && isRetryableRegistrationError(e)) {
        logPageDisplay("wallet_create_flow", {
          flow: "retry_server_catch_keep_pending",
          message: e instanceof Error ? e.message : String(e),
        });
      } else {
        logPageDisplay("wallet_create_flow", {
          flow: "retry_server_catch",
          message: e instanceof Error ? e.message : String(e),
        });
        setFlowError(e instanceof Error ? e.message : "Wallet registration failed");
        if (provisionalWalletVisibleRef.current) {
          setStep("done");
          setServerOnlyRetry(true);
        } else {
          setStep("idle");
          setServerOnlyRetry(false);
        }
        setHomeBootstrap({ serverRegPending: false });
      }
    } finally {
      walletCreateModuleInFlight = false;
    }
  }, [applyServerWalletAfterRegister, clearProvisionalRegistration, createAndRegisterWalletFlow, applyCreatedForRegister]);

  useEffect(() => {
    if (wallet?.wallet_address) {
      setHomeBootstrap({ provisionalAddress: null, serverRegPending: false });
    }
  }, [wallet?.wallet_address]);

  /**
   * `serverRegPending` is normally cleared when `executeWalletServerRegistration` resolves. The
   * underlying race can be owned by a remounted instance so it never completes even after the server
   * has the row — the “Finishing on the server” line would stick forever. Poll from the **current**
   * tree: `/api/wallet/status` (fast) plus throttled `POST /api/wallet/register` when the first
   * request 504d with no row (status alone can never “create” the row).
   */
  useEffect(() => {
    if (status !== "ok") {
      return;
    }
    if (!getHomeBootstrap().serverRegPending) {
      return;
    }
    const init = typeof initData === "string" && initData.trim() !== "" ? initData : null;
    if (!init) {
      return;
    }
    const expectAddr = getHomeBootstrap().provisionalAddress;
    if (!expectAddr) {
      return;
    }
    logPageDisplay("wallet_create_flow", {
      flow: "side_poll_effect_armed",
      note: "status_and_throttled_register_until_row_matches",
    });

    let cancelled = false;
    let recovered = false;
    let sidePollTick = 0;
    let sidePollInFlight = false;

    const applyRecoveredRow = (row: TelegramWalletRow, via: "ui_side_status_poll" | "ui_side_register_post_retry") => {
      recovered = true;
      walletRegSatisfiedBySideStatusPoll = true;
      logPageDisplay("wallet_create_flow", {
        flow: "register_ok",
        hasServerWallet: true,
        via,
      });
      applyServerWalletAfterRegister(row);
      applyCreatedForRegister(row.wallet_address);
      const mod = pendingServerRegModule;
      if (mod && sameTonAddressForPoll(mod.walletAddress, expectAddr)) {
        scheduleWalletKeyBackground(mod.masterKey, mod.mnemonic, setMasterKeyStorageTier, mod.walletAddress);
      }
      clearPendingServerRegModuleStore();
      pendingServerRegRef.current = null;
      setHomeBootstrap({ serverRegPending: false, provisionalAddress: null });
      provisionalWalletVisibleRef.current = false;
    };

    const tick = async () => {
      if (cancelled || recovered) {
        return;
      }
      if (sidePollInFlight) {
        return;
      }
      if (!getHomeBootstrap().serverRegPending) {
        return;
      }
      sidePollInFlight = true;
      try {
        sidePollTick += 1;
        if (sidePollTick === 1) {
          logPageDisplay("wallet_create_flow", { flow: "side_poll_first_tick" });
        }

        const row = await fetchDefaultWalletStatusRow(init, WALLET_REGISTER_STATUS_FETCH_MS);
        if (cancelled || recovered) {
          return;
        }
        if (row && sameTonAddressForPoll(row.wallet_address, expectAddr)) {
          applyRecoveredRow(row, "ui_side_status_poll");
          return;
        }
        if (row && !sameTonAddressForPoll(row.wallet_address, expectAddr) && sidePollTick === 1) {
          logPageDisplay("wallet_create_flow", {
            flow: "side_status_row_other_address",
            note: "default_wallet_does_not_match_provisional",
          });
        }

        const mod = pendingServerRegModule;
        const shouldPostRegister =
          mod != null &&
          sameTonAddressForPoll(mod.walletAddress, expectAddr) &&
          (sidePollTick === 1 || sidePollTick % SIDE_REGISTER_RETRY_INTERVAL_TICKS === 0);
        if (!shouldPostRegister) {
          return;
        }
        if (cancelled || recovered) {
          return;
        }
        if (!getHomeBootstrap().serverRegPending) {
          return;
        }
        try {
          logPageDisplay("wallet_create_flow", {
            flow: "side_register_retry_post",
            tick: sidePollTick,
          });
          const response = await fetchWithTimeout(
            mod.registerUrl,
            mod.registerInit,
            SIDE_REGISTER_POST_TIMEOUT_MS,
          );
          const json = (await response.json().catch(() => ({}))) as { ok?: boolean; wallet?: unknown };
          if (cancelled || recovered) {
            return;
          }
          if (response.ok && json?.ok) {
            const w = registerWalletFromJson(json.wallet);
            if (w && sameTonAddressForPoll(w.wallet_address, expectAddr)) {
              applyRecoveredRow(w, "ui_side_register_post_retry");
              return;
            }
            if (w) {
              logPageDisplay("wallet_create_flow", {
                flow: "side_register_address_mismatch",
                tick: sidePollTick,
              });
            }
          }
          logPageDisplay("wallet_create_flow", {
            flow: "side_register_retry_response",
            httpStatus: response.status,
          });
        } catch {
          /* same cadence as main flow: network/timeout; next tick retries */
        }
      } finally {
        sidePollInFlight = false;
      }
    };

    const id = setInterval(() => {
      void tick();
    }, WALLET_REGISTER_POLL_INTERVAL_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    homeBootstrapVersion,
    initData,
    status,
    applyServerWalletAfterRegister,
    applyCreatedForRegister,
    setMasterKeyStorageTier,
  ]);

  /** useLayoutEffect: start as soon as the home shell commits (before paint) so the flow is less likely to race hydration recovery (#418) or sit on idle+spinner. */
  useLayoutEffect(() => {
    const initDataOk = Boolean(initData && (typeof initData !== "string" || initData.trim() !== ""));
    const guard = {
      hasFlowError: Boolean(flowError),
      status,
      walletRequired,
      hasDisplayAddress,
      step,
      initDataLen: initData == null ? 0 : typeof initData === "string" ? initData.length : -1,
      initDataOk,
    } as const;

    if (flowError) {
      logPageDisplay("wallet_start_guard", { ...guard, action: "skip_flow_error" });
      return;
    }
    if (
      status === "ok" &&
      walletRequired &&
      !hasDisplayAddress &&
      step === "idle" &&
      initDataOk
    ) {
      logPageDisplay("wallet_start_guard", { ...guard, action: "start" });
      void createAndRegisterWalletFlow();
    } else {
      const reasons: string[] = [];
      if (status !== "ok") {
        reasons.push("status_not_ok");
      }
      if (!walletRequired) {
        reasons.push("wallet_not_required");
      }
      if (hasDisplayAddress) {
        reasons.push("has_address");
      }
      if (step !== "idle") {
        reasons.push(`step_${step}`);
      }
      if (!initDataOk) {
        reasons.push("init_data_missing_or_blank");
      }
      logPageDisplay("wallet_start_guard", { ...guard, action: "skip_conditions", reasons });
    }
  }, [flowError, status, walletRequired, hasDisplayAddress, step, initData, createAndRegisterWalletFlow]);

  /**
   * If the layout effect never started the flow (e.g. timing with deferred web root mount), kick once
   * on the next tick. Second call is a no-op while `walletCreateModuleInFlight` is true.
   */
  useEffect(() => {
    if (flowError) {
      return;
    }
    if (isWalletCreateFlowModuleLocked()) {
      return;
    }
    const initDataOk = Boolean(initData && (typeof initData !== "string" || initData.trim() !== ""));
    if (status !== "ok" || !walletRequired || hasDisplayAddress || !initDataOk || step !== "idle") {
      return;
    }
    const t = setTimeout(() => {
      if (flowError) {
        return;
      }
      if (isWalletCreateFlowModuleLocked()) {
        return;
      }
      if (status !== "ok" || !walletRequired || hasDisplayAddress || !initDataOk || step !== "idle") {
        return;
      }
      logPageDisplay("wallet_create_flow", { flow: "effect_fallback" });
      void createAndRegisterWalletFlow();
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, [flowError, status, walletRequired, hasDisplayAddress, step, initData, createAndRegisterWalletFlow]);

  useEffect(() => {
    logPageDisplay("home_authenticated_phase", {
      phase: homePhase,
      status,
      walletRequired,
      hasWallet,
      effectiveHasWallet,
      hasInitData: Boolean(initData),
      debug: {
        webAppPollCount: debug.webAppPollCount,
        initDataPollCount: debug.initDataPollCount,
        apiStatus: debug.apiStatus,
        apiMessage: debug.apiMessage,
        fetchDurationMs: debug.fetchDurationMs,
      },
    });
  }, [
    homePhase,
    status,
    walletRequired,
    hasWallet,
    effectiveHasWallet,
    initData,
    debug.webAppPollCount,
    debug.initDataPollCount,
    debug.apiStatus,
    debug.apiMessage,
    debug.fetchDurationMs,
  ]);

  if (isBrowserSessionHydrating) {
    // Signed-in browser reload: keep this phase visually neutral while Telegram provider hydrates
    // session-backed fields, so users do not see a temporary "other page".
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (status === "idle" || status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ marginBottom: 12, color: colors.primary }}>Loading…</Text>
        <View
          style={{
            padding: 8,
            borderRadius: 8,
            alignSelf: "stretch",
            borderWidth: 1,
            borderColor: colors.highlight,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>Debug</Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            hasWebAppApi: {String(debug.hasWebAppApi)} · inTelegram: {String(debug.inTelegramClient)}
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>webAppApiPoll: {debug.webAppPollCount}</Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            initData: {debug.initDataLength != null ? debug.initDataLength : "—"}
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>initDataPoll: {debug.initDataPollCount}</Text>
          <Text style={{ fontSize: 10, color: colors.secondary, marginTop: 4 }}>
            initDataPoll only runs when a Telegram launch or real WebApp platform is detected; otherwise
            we stop (no infinite poll outside Telegram).
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}
          </Text>
          {debug.apiUrl != null && (
            <Text style={{ fontSize: 10, color: colors.primary }}>url: {debug.apiUrl}</Text>
          )}
          {debug.fetchDurationMs != null && (
            <Text style={{ fontSize: 11, color: colors.primary }}>fetchMs: {debug.fetchDurationMs}</Text>
          )}
          {debug.lastLog != null && (
            <Text style={{ fontSize: 11, color: colors.primary }}>lastLog: {debug.lastLog}</Text>
          )}
        </View>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 8, color: colors.primary }}>
          Telegram registration failed
        </Text>
        <Text style={{ textAlign: "center", marginBottom: 12, color: colors.primary }}>{error}</Text>
        <View
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 8,
            alignSelf: "stretch",
            borderWidth: 1,
            borderColor: colors.highlight,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>Debug</Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            hasWebAppApi: {String(debug.hasWebAppApi)} · inTelegram: {String(debug.inTelegramClient)} ·
            initData: {debug.initDataLength ?? "—"}
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            webAppApiPoll: {debug.webAppPollCount} · initDataPoll: {debug.initDataPollCount}
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}
          </Text>
          {debug.apiUrl != null && (
            <Text style={{ fontSize: 10, color: colors.primary }}>url: {debug.apiUrl}</Text>
          )}
          {debug.fetchDurationMs != null && (
            <Text style={{ fontSize: 11, color: colors.primary }}>fetchMs: {debug.fetchDurationMs}</Text>
          )}
          {debug.lastLog != null && (
            <Text style={{ fontSize: 11, color: colors.primary }}>lastLog: {debug.lastLog}</Text>
          )}
        </View>
      </View>
    );
  }

  if (status === "dev") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 8, color: colors.primary }}>
          Hyperlinks Space Program
        </Text>
        <Text style={{ textAlign: "center", marginBottom: 12, color: colors.primary }}>
          Outside Telegram, authentication abandoned.
        </Text>
        <View
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 8,
            alignSelf: "stretch",
            borderWidth: 1,
            borderColor: colors.highlight,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>Debug</Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            hasWebAppApi: {String(debug.hasWebAppApi)} · inTelegram: {String(debug.inTelegramClient)}
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>webAppApiPoll: {debug.webAppPollCount}</Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            initData: {debug.initDataLength != null ? debug.initDataLength : "—"}
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>initDataPoll: {debug.initDataPollCount}</Text>
          <Text style={{ fontSize: 10, color: colors.secondary, marginTop: 4 }}>
            initDataPoll only runs when Telegram launch or real WebApp platform is detected; otherwise
            we stop (no infinite polling outside Telegram).
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>
            api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}
          </Text>
          {debug.apiUrl != null && (
            <Text style={{ fontSize: 10, color: colors.primary }}>url: {debug.apiUrl}</Text>
          )}
          {debug.fetchDurationMs != null && (
            <Text style={{ fontSize: 11, color: colors.primary }}>fetchMs: {debug.fetchDurationMs}</Text>
          )}
          {debug.lastLog != null && (
            <Text style={{ fontSize: 11, color: colors.primary }}>lastLog: {debug.lastLog}</Text>
          )}
        </View>
      </View>
    );
  }

  /**
   * Spinner only during local key generation (before the derived address is set). Server registration
   * runs with the address already on screen and uses the module `serverRegPending` flag for a secondary hint.
   */
  const showWalletProvisioning =
    status === "ok" &&
    !flowError &&
    !hasDisplayAddress &&
    walletRequired &&
    step === "saving";

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        backgroundColor: colors.background,
      }}
    >
      <Text
        style={{
          fontWeight: "600",
          marginBottom: 8,
          color: colors.primary,
          fontSize: 18,
          lineHeight: 24,
          textAlign: "center",
        }}
      >
        HyperlinksSpace Wallet
      </Text>
      {telegramUsername ? (
        <View style={{ width: "100%", alignSelf: "stretch", marginBottom: 8 }}>
          <Text
            style={{
              textAlign: "center",
              color: colors.primary,
              fontSize: 16,
              lineHeight: 24,
            }}
          >
            You are logged in via Telegram as @{telegramUsername}.
          </Text>
        </View>
      ) : null}
      {effectiveWalletAddress ? (
        <View style={{ width: "100%", alignItems: "center", alignSelf: "stretch" }}>
          <Text style={{ textAlign: "center", color: colors.primary, lineHeight: 22 }}>Wallet:</Text>
          <Text
            style={{
              textAlign: "center",
              marginTop: 4,
              color: colors.primary,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {effectiveWalletAddress}
          </Text>
        </View>
      ) : null}
      {flowError ? (
        <View style={{ width: "100%", alignItems: "center", alignSelf: "stretch", marginTop: 8, gap: 8 }}>
          <Text style={{ textAlign: "center", color: "#b00020", lineHeight: 22 }}>{flowError}</Text>
          {serverOnlyRetry ? (
            <Button title="Retry server registration" onPress={retryServerRegistrationOnly} />
          ) : (
            <Button title="Retry wallet creation" onPress={createAndRegisterWalletFlow} />
          )}
        </View>
      ) : null}
      {showWalletProvisioning ? (
        <View style={{ marginTop: 12, marginBottom: 4, maxWidth: 360, alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text
            style={{
              textAlign: "center",
              fontSize: 13,
              lineHeight: 20,
              color: colors.highlight,
            }}
          >
            Generating your wallet keys…
          </Text>
        </View>
      ) : null}
      {!flowError && isServerRegPendingFromModule && effectiveWalletAddress ? (
        <View style={{ marginTop: 10, maxWidth: 360, alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: 6 }} />
          <Text style={{ textAlign: "center", fontSize: 12, lineHeight: 18, color: colors.highlight }}>
            Finishing on the server (saving the row). You can wait or close the app; your address is already shown.
          </Text>
        </View>
      ) : null}
      {masterKeyStorageTier === "device" ? (
        <Text style={{ marginTop: 14, fontSize: 12, color: "#856404", textAlign: "center", paddingHorizontal: 8 }}>
          This Telegram client does not support SecureStorage, so your wallet key was stored in DeviceStorage
          (persistent app storage, not the system keychain). That is weaker than SecureStorage; keep your seed
          phrase safe and prefer Telegram on iOS/Android when possible.
        </Text>
      ) : null}
      {masterKeyStorageTier === "none" ? (
        <Text style={{ marginTop: 14, fontSize: 12, color: "#b00020", textAlign: "center", paddingHorizontal: 8 }}>
          Could not save your wallet key on this device. Cloud ciphertext may still sync, but you will need your
          recovery phrase to sign here until storage works. Try another Telegram client or update the app.
        </Text>
      ) : null}
    </View>
  );
}

