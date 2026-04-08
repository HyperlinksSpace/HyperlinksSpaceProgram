/**
 * Telegram Mini App storage availability probe (paste into DevTools console).
 *
 * What this script does:
 * 1) Checks whether Telegram WebApp bridge exists.
 * 2) Probes SecureStorage by real write+read+remove roundtrip.
 * 3) Probes DeviceStorage by real write+read+remove roundtrip.
 * 4) Probes CloudStorage by real write+read+remove roundtrip.
 * 5) Prints a single QA verdict:
 *    - "secure" => SecureStorage works.
 *    - "device" => SecureStorage fails, but DeviceStorage works.
 *    - "none"   => neither SecureStorage nor DeviceStorage works.
 *
 * Notes:
 * - "API object exists" does NOT mean storage is supported. Telegram Desktop may expose methods
 *   but return UNSUPPORTED at runtime. This script verifies runtime behavior.
 * - Probe keys are deleted at the end.
 */
(async () => {
  const wa = window.Telegram?.WebApp;
  if (!wa) {
    const result = {
      verdict: "none",
      webApp: null,
      error: "Telegram.WebApp not found (not running in TMA context).",
    };
    console.log("[storage-probe]", result);
    return result;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const probeSecureOrDevice = async (storage, eventPrefix, includeCanRestore) => {
    const key = `probe_${eventPrefix}_${Date.now()}`;
    const value = "ok";
    let eventFailed = null;

    const failedEventName = `${eventPrefix}_failed`;
    const savedEventName = `${eventPrefix}_key_saved`;

    const onFailed = (payload) => { eventFailed = payload; };
    const onSaved = () => {};

    try {
      wa.onEvent?.(failedEventName, onFailed);
      wa.onEvent?.(savedEventName, onSaved);
    } catch {}

    const cleanup = () => {
      try { wa.offEvent?.(failedEventName, onFailed); } catch {}
      try { wa.offEvent?.(savedEventName, onSaved); } catch {}
    };

    if (!storage || typeof storage.setItem !== "function" || typeof storage.getItem !== "function") {
      cleanup();
      return {
        present: false,
        supported: false,
        set: null,
        get: null,
        remove: null,
        eventFailed: null,
      };
    }

    return new Promise((resolve) => {
      storage.setItem(key, value, (setErr, stored) => {
        storage.getItem(key, async (getErr, gotValue, canRestore) => {
          await wait(50);

          const base = {
            present: true,
            supported: setErr == null && getErr == null && gotValue === value,
            set: { err: setErr ?? null, stored: stored ?? null },
            get: includeCanRestore
              ? { err: getErr ?? null, value: gotValue ?? null, canRestore: canRestore ?? null }
              : { err: getErr ?? null, value: gotValue ?? null },
            remove: null,
            eventFailed,
          };

          if (typeof storage.removeItem === "function") {
            storage.removeItem(key, (rmErr, removed) => {
              base.remove = { err: rmErr ?? null, removed: removed ?? null };
              cleanup();
              resolve(base);
            });
          } else {
            cleanup();
            resolve(base);
          }
        });
      });
    });
  };

  const probeCloudStorage = async () => {
    const cs = wa.CloudStorage;
    const key = `probe_cloud_${Date.now()}`;
    const value = "ok";

    if (!cs || typeof cs.setItem !== "function" || typeof cs.getItem !== "function") {
      return {
        present: false,
        supported: false,
        set: null,
        get: null,
        remove: null,
      };
    }

    return new Promise((resolve) => {
      cs.setItem(key, value, (setErr, stored) => {
        cs.getItem(key, (getErr, gotValue) => {
          const out = {
            present: true,
            supported: setErr == null && getErr == null && gotValue === value,
            set: { err: setErr ?? null, stored: stored ?? null },
            get: { err: getErr ?? null, value: gotValue ?? null },
            remove: null,
          };

          if (typeof cs.removeItem === "function") {
            cs.removeItem(key, (rmErr, removed) => {
              out.remove = { err: rmErr ?? null, removed: removed ?? null };
              resolve(out);
            });
          } else {
            resolve(out);
          }
        });
      });
    });
  };

  const secureStorage = await probeSecureOrDevice(wa.SecureStorage, "secure_storage", true);
  const deviceStorage = await probeSecureOrDevice(wa.DeviceStorage, "device_storage", false);
  const cloudStorage = await probeCloudStorage();

  const verdict = secureStorage.supported ? "secure" : deviceStorage.supported ? "device" : "none";

  const result = {
    verdict,
    webApp: { platform: wa.platform ?? null, version: wa.version ?? null },
    secureStorage,
    deviceStorage,
    cloudStorage,
  };

  console.log(`[storage-probe] verdict=${verdict}`, result);
  return result;
})();
