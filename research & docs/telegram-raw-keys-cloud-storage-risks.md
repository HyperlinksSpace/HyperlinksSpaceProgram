# Telegram CloudStorage Raw Keys Risks

This note clarifies a common misunderstanding:

- It is true that Telegram Mini App `CloudStorage` is scoped per bot/per user.
- It is true that each Telegram user session is strongly protected by Telegram account security controls (session management, device authorization, transport security, etc.).
- It is also true that endpoint compromise exists in both models (Bitcoin Core local storage and TMA/web clients).

The key security difference is not "cross-user direct reads". The key difference is how compromise can scale through the app runtime.

In other words: Telegram session protection is a strong baseline and should be acknowledged. The residual risk discussed here is about compromised Mini App code/runtime on an already authenticated user session, not about bypassing Telegram account/session controls.

## Corrected comparison

Exactly: a PC can be hacked in both cases.

- **Bitcoin Core local storage:** an attacker usually needs to compromise that specific machine (or steal wallet backups) to get that user's keys.
- **Raw mnemonic in Telegram CloudStorage:** per-user storage still applies, but if the Mini App runtime/supply chain is compromised, malicious code can read each currently logged-in user's own CloudStorage during their session and exfiltrate it. This can impact many users over time without a "read all users" API.

So both models are vulnerable to endpoint compromise, but web/TMA delivery can add centralized distribution/supply-chain risk that increases aggregate exposure.

## Practical differences vs local desktop wallet model

- **Runtime surface:**
  - Local desktop wallet (Bitcoin Core style): narrower app distribution/runtime model.
  - Web/TMA app: JavaScript/runtime/supply-chain surface is broader.

- **Secret impact on read:**
  - **Raw mnemonic in cloud:** one successful read is immediate takeover.
  - **Encrypted cloud blob:** attacker still needs decrypt capability (password/device key), which adds a barrier.

