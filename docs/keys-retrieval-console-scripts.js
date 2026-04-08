/**
 * Telegram Mini App key retrieval checker (paste into DevTools console).
 *
 * Purpose:
 * - Inspect where wallet keys are currently stored after app flow runs.
 * - Check these keys across available storages:
 *   1) SecureStorage: wallet_master_key
 *   2) DeviceStorage: wallet_master_key
 *   3) CloudStorage:  wallet_seed_cipher
 *
 * What it prints:
 * - Per-storage availability (API object + method presence).
 * - Read result for each key (err/value present/length).
 * - Final quick verdict about expected Desktop fallback model:
 *   - secureOnly: master key in SecureStorage
 *   - deviceFallback: master key in DeviceStorage
 *   - none: master key not found in either local store
 *
 * Notes:
 * - This script does not print full secret values; it shows only existence/length.
 * - In some Telegram Desktop builds, SecureStorage methods exist but return UNSUPPORTED.
 */
(async () => {
  const wa = window.Telegram?.WebApp;
  if (!wa) {
    const out = { ok: false, error: "Telegram.WebApp not found" };
    console.log("[keys-retrieval]", out);
    return out;
  }

  const readSecure = (key) =>
    new Promise((resolve) => {
      const storage = wa.SecureStorage;
      if (!storage || typeof storage.getItem !== "function") {
        resolve({ present: false, err: "NO_API", value: null, canRestore: null });
        return;
      }
      storage.getItem(key, (err, value, canRestore) => {
        resolve({
          present: true,
          err: err ?? null,
          value: value ?? null,
          canRestore: canRestore ?? null,
        });
      });
    });

  const readDevice = (key) =>
    new Promise((resolve) => {
      const storage = wa.DeviceStorage;
      if (!storage || typeof storage.getItem !== "function") {
        resolve({ present: false, err: "NO_API", value: null });
        return;
      }
      storage.getItem(key, (err, value) => {
        resolve({
          present: true,
          err: err ?? null,
          value: value ?? null,
        });
      });
    });

  const readCloud = (key) =>
    new Promise((resolve) => {
      const storage = wa.CloudStorage;
      if (!storage || typeof storage.getItem !== "function") {
        resolve({ present: false, err: "NO_API", value: null });
        return;
      }
      storage.getItem(key, (err, value) => {
        resolve({
          present: true,
          err: err ?? null,
          value: value ?? null,
        });
      });
    });

  const [secureMaster, deviceMaster, cloudSeedCipher] = await Promise.all([
    readSecure("wallet_master_key"),
    readDevice("wallet_master_key"),
    readCloud("wallet_seed_cipher"),
  ]);

  const hasSecureMaster = secureMaster.value != null && secureMaster.err == null;
  const hasDeviceMaster = deviceMaster.value != null && deviceMaster.err == null;
  const hasCloudSeedCipher = cloudSeedCipher.value != null && cloudSeedCipher.err == null;

  const localTier = hasSecureMaster ? "secureOnly" : hasDeviceMaster ? "deviceFallback" : "none";

  const result = {
    ok: true,
    webApp: {
      platform: wa.platform ?? null,
      version: wa.version ?? null,
    },
    keys: {
      wallet_master_key: {
        secureStorage: {
          available: secureMaster.present,
          err: secureMaster.err,
          exists: hasSecureMaster,
          valueLength: typeof secureMaster.value === "string" ? secureMaster.value.length : 0,
          canRestore: secureMaster.canRestore ?? null,
        },
        deviceStorage: {
          available: deviceMaster.present,
          err: deviceMaster.err,
          exists: hasDeviceMaster,
          valueLength: typeof deviceMaster.value === "string" ? deviceMaster.value.length : 0,
        },
      },
      wallet_seed_cipher: {
        cloudStorage: {
          available: cloudSeedCipher.present,
          err: cloudSeedCipher.err,
          exists: hasCloudSeedCipher,
          valueLength: typeof cloudSeedCipher.value === "string" ? cloudSeedCipher.value.length : 0,
        },
      },
    },
    verdict: {
      localTier,
      modelOkForDesktopFallback: localTier === "deviceFallback" && hasCloudSeedCipher,
    },
  };

  console.log("[keys-retrieval]", result);
  return result;
})();
