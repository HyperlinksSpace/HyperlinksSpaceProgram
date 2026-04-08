# Storage Lifetime for Wallet Keys

This document summarizes practical storage lifetime expectations for wallet-related secrets.

Important: "lifetime" is never absolute. Every layer can be lost due to account loss, uninstall, reset, policy changes, corruption, or compromise.

## Quick Matrix

| Storage type | Typical lifetime | Main limiting factor | Cross-device | Notes for wallet keys |
|---|---|---|---|---|
| Telegram CloudStorage | Potentially long-lived | Telegram account/app availability and platform behavior | Yes (inside Telegram ecosystem) | Use for ciphertext/public metadata, not raw mnemonic |
| Telegram SecureStorage | Device-scoped durable | Device/app reinstall/reset and client support | No | Best TMA local tier when supported |
| Telegram DeviceStorage | Device-scoped durable | Device/app reinstall/reset | No | Weaker than SecureStorage; fallback tier |
| Session Storage (`sessionStorage`) | Current tab/session only | Tab/window/browser session end | No | Not suitable for persistent keys |
| Browser Local Storage (`localStorage`) | Potentially long-lived on same browser profile | User clearing data, browser profile loss | No | Use only encrypted blobs if needed |
| IndexedDB (web) | Potentially long-lived on same browser profile | User/browser data clearing, profile loss | No | Better than localStorage for larger encrypted blobs |
| Expo Secure Store (iOS/Android) | Durable on device | Uninstall/reset/device change | No | Good native local secret store; still not "forever" |
| Electron OS secure storage (Windows/macOS) | Durable on device profile | OS profile/device lifetime, reinstall/migration | No | Suitable desktop local secret store |
| In-memory runtime only | Process/session only | App restart/crash/background termination | No | Best for temporary decrypted material |

## Lifetime Statements (practical wording)

- **Telegram CloudStorage:** theoretically long-lived, practically bounded by **Telegram account lifetime and platform behavior**.
- **Device-local storage (SecureStorage/DeviceStorage/Secure Store/OS keychain):** bounded by **device/app/profile lifetime**.
- **Session storage:** bounded by **session lifetime** (tab/window/app session).

## Recommended usage pattern

1. Keep **mnemonic as offline backup** (user-controlled, not in backend/cloud plaintext).
2. Store day-to-day local unlock material in the strongest available **device-local secure store**.
3. Store only **ciphertext** in cloud/sync layers.
4. Treat all lifetimes as "best effort durability", not guaranteed permanence.

