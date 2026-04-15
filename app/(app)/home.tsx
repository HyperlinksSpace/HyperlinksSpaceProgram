import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "react-native";
import { useTelegram } from "../../ui/components/Telegram";
import { useColors } from "../../ui/theme";
import {
  createSeedCipher,
  deriveAddressFromMnemonic,
  deriveMasterKeyFromMnemonic,
  generateMnemonic,
} from "../../services/wallet/tonWallet";

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

/** CloudStorage.setItem uses the same callback shape as SecureStorage. */
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

export default function HomeScreen() {
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
  } = useTelegram();
  const [step, setStep] = useState<CreateStep>("idle");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [createdWalletAddress, setCreatedWalletAddress] = useState<string | null>(null);
  const [masterKeyStorageTier, setMasterKeyStorageTier] = useState<WalletMasterKeyStorageTier | null>(null);
  const effectiveWalletAddress = wallet?.wallet_address ?? createdWalletAddress;
  const effectiveHasWallet = hasWallet || Boolean(createdWalletAddress);

  const createAndRegisterWalletFlow = useCallback(async () => {
    if (!initData) {
      setFlowError("Missing Telegram initData.");
      return;
    }
    setFlowError(null);
    setStep("saving");
    try {
      const mnemonic = await generateMnemonic();
      const walletAddress = await deriveAddressFromMnemonic({ mnemonic, testnet: false });
      const masterKey = await deriveMasterKeyFromMnemonic(mnemonic);
      const seedCipher = await createSeedCipher(masterKey, mnemonic.join(" "));

      // Register with API first: SecureStorage can fail/hang (see secure_storage_failed) and must not block.
      const response = await fetch("/api/wallet/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          wallet_address: walletAddress,
          wallet_blockchain: "ton",
          wallet_net: "mainnet",
          type: "internal",
          label: "Main wallet",
          source: "miniapp",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${response.status}`);
      }
      const [tier, cloudOk] = await Promise.all([
        persistWalletMasterKey(masterKey),
        setTmaCloudStorageItem("wallet_seed_cipher", seedCipher),
      ]);
      setMasterKeyStorageTier(tier);
      if (!cloudOk && typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[wallet] wallet_seed_cipher not saved to CloudStorage");
      }

      setCreatedWalletAddress(walletAddress);
      setStep("done");
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : "Wallet registration failed");
      setStep("idle");
    }
  }, [initData]);

  useEffect(() => {
    if (
      status === "ok" &&
      walletRequired &&
      !hasWallet &&
      !createdWalletAddress &&
      step === "idle" &&
      initData
    ) {
      void createAndRegisterWalletFlow();
    }
  }, [status, walletRequired, hasWallet, createdWalletAddress, step, initData, createAndRegisterWalletFlow]);

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
            borderColor: colors.secondary,
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
            borderColor: colors.secondary,
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
            borderColor: colors.secondary,
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

  if (status === "ok" && walletRequired && !effectiveHasWallet) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 16, gap: 10, backgroundColor: colors.background }}>
        <Text style={{ fontWeight: "700", fontSize: 18, color: colors.primary }}>Preparing your wallet</Text>
        <Text style={{ color: colors.primary }}>
          No wallet found for this Telegram account. Creating one now and registering public wallet
          data.
        </Text>
        {step === "saving" && <Text style={{ color: colors.primary }}>Saving secrets and registering wallet...</Text>}
        {flowError ? <Text style={{ color: "#b00020" }}>{flowError}</Text> : null}
        {flowError ? <Button title="Retry wallet creation" onPress={createAndRegisterWalletFlow} /> : null}
      </View>
    );
  }

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
        HyperlinksSpace Wallet
      </Text>
      {telegramUsername ? (
        <Text style={{ textAlign: "center", marginBottom: 8, color: colors.primary }}>
          You are logged in via Telegram as @{telegramUsername}.
        </Text>
      ) : null}
      {effectiveWalletAddress ? (
        <View style={{ alignItems: "center" }}>
          <Text style={{ textAlign: "center", color: colors.primary }}>Wallet:</Text>
          <Text style={{ textAlign: "center", marginTop: 4, color: colors.primary }}>
            {effectiveWalletAddress}
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

