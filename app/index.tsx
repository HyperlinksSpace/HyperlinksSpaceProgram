import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "react-native";
import { useTelegram } from "../ui/components/Telegram";
import {
  createSeedCipher,
  deriveAddressFromMnemonic,
  deriveMasterKeyFromMnemonic,
  generateMnemonic,
} from "../services/wallet/tonWallet";

type CreateStep = "idle" | "saving" | "done";

type TelegramWebAppBridge = {
  SecureStorage?: {
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

export default function Index() {
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

      // Local fallback cache for recoverability in non-TMA/dev mode.
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("wallet_master_key", masterKey);
        localStorage.setItem("wallet_seed_cipher", seedCipher);
      }

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
      setCreatedWalletAddress(walletAddress);
      setStep("done");

      void Promise.all([
        setTmaSecureStorageItem("wallet_master_key", masterKey),
        setTmaCloudStorageItem("wallet_seed_cipher", seedCipher),
      ]).catch(() => {});
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }}>
        <Text style={{ marginBottom: 12 }}>Loading…</Text>
        <View style={{ padding: 8, backgroundColor: "#f0f0f0", borderRadius: 8, alignSelf: "stretch" }}>
          <Text style={{ fontSize: 12, fontWeight: "600" }}>Debug</Text>
          <Text style={{ fontSize: 11 }}>hasWebApp: {String(debug.hasWebApp)}</Text>
          <Text style={{ fontSize: 11 }}>webAppPoll: {debug.webAppPollCount}</Text>
          <Text style={{ fontSize: 11 }}>initData: {debug.initDataLength != null ? debug.initDataLength : "—"}</Text>
          <Text style={{ fontSize: 11 }}>pollCount: {debug.pollCount}</Text>
          <Text style={{ fontSize: 11 }}>api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}</Text>
          {debug.apiUrl != null && <Text style={{ fontSize: 10 }}>url: {debug.apiUrl}</Text>}
          {debug.fetchDurationMs != null && <Text style={{ fontSize: 11 }}>fetchMs: {debug.fetchDurationMs}</Text>}
          {debug.lastLog != null && <Text style={{ fontSize: 11 }}>lastLog: {debug.lastLog}</Text>}
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
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 8 }}>
          Telegram registration failed
        </Text>
        <Text style={{ textAlign: "center", marginBottom: 12 }}>{error}</Text>
        <View style={{ marginTop: 8, padding: 8, backgroundColor: "#f0f0f0", borderRadius: 8, alignSelf: "stretch" }}>
          <Text style={{ fontSize: 12, fontWeight: "600" }}>Debug</Text>
          <Text style={{ fontSize: 11 }}>hasWebApp: {String(debug.hasWebApp)} · initData: {debug.initDataLength ?? "—"}</Text>
          <Text style={{ fontSize: 11 }}>api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}</Text>
          {debug.apiUrl != null && <Text style={{ fontSize: 10 }}>url: {debug.apiUrl}</Text>}
          {debug.fetchDurationMs != null && <Text style={{ fontSize: 11 }}>fetchMs: {debug.fetchDurationMs}</Text>}
          {debug.lastLog != null && <Text style={{ fontSize: 11 }}>lastLog: {debug.lastLog}</Text>}
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
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 8 }}>
          Hyperlinks Space Program
        </Text>
        <Text style={{ textAlign: "center", marginBottom: 12 }}>
          Outside Telegram, authentication abandoned.
        </Text>
        <View style={{ marginTop: 8, padding: 8, backgroundColor: "#f0f0f0", borderRadius: 8, alignSelf: "stretch" }}>
          <Text style={{ fontSize: 12, fontWeight: "600" }}>Debug</Text>
          <Text style={{ fontSize: 11 }}>hasWebApp: {String(debug.hasWebApp)}</Text>
          <Text style={{ fontSize: 11 }}>webAppPoll: {debug.webAppPollCount}</Text>
          <Text style={{ fontSize: 11 }}>initData: {debug.initDataLength != null ? debug.initDataLength : "—"}</Text>
          <Text style={{ fontSize: 11 }}>api: {debug.apiStatus ?? "—"} {debug.apiMessage ?? ""}</Text>
          {debug.apiUrl != null && <Text style={{ fontSize: 10 }}>url: {debug.apiUrl}</Text>}
          {debug.fetchDurationMs != null && <Text style={{ fontSize: 11 }}>fetchMs: {debug.fetchDurationMs}</Text>}
          {debug.lastLog != null && <Text style={{ fontSize: 11 }}>lastLog: {debug.lastLog}</Text>}
        </View>
      </View>
    );
  }

  if (status === "ok" && walletRequired && !effectiveHasWallet) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 16, gap: 10 }}>
        <Text style={{ fontWeight: "700", fontSize: 18 }}>Preparing your wallet</Text>
        <Text>
          No wallet found for this Telegram account. Creating one now and registering public wallet
          data.
        </Text>
        {step === "saving" && <Text>Saving secrets and registering wallet...</Text>}
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
      }}
    >
      <Text style={{ fontWeight: "600", marginBottom: 8 }}>
        HyperlinksSpace Wallet
      </Text>
      {telegramUsername ? (
        <Text style={{ textAlign: "center", marginBottom: 8 }}>
          You are logged in via Telegram as @{telegramUsername}.
        </Text>
      ) : null}
      {effectiveWalletAddress ? (
        <Text style={{ textAlign: "center" }}>
          Wallet: {effectiveWalletAddress}.
        </Text>
      ) : null}
    </View>
  );
}

