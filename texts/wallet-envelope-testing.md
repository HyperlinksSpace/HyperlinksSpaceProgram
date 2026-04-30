# Testing wallet envelope (Neon + Cloud KMS)

After `npm run db:migrate`, `wallets` has `envelope_ciphertext`, `envelope_nonce`, `wrapped_dek`, `envelope_alg`.  
Create flow in the Mini App calls `POST /api/wallet/register` with `wallet_payload_*` + `dek`; the API wraps `dek` with KMS and stores the wrapped blob in Neon.

## Prerequisites

- `DATABASE_URL` — Neon
- `GCP_SERVICE_ACCOUNT_JSON` — SA allowed to use the KEK (or local key file / `GOOGLE_APPLICATION_CREDENTIALS`)
- `BOT_TOKEN` — valid Telegram bot token (for `initData` verification)

## 1) Confirm KMS wiring (existing routes)

```bash
curl -sS "http://localhost:3000/api/kmsping?diag=1"
curl -sS --max-time 120 "http://localhost:3000/api/kms-roundtrip?quick=1"
```

## 2) Create a wallet from the app

Use the in-app flow so the client sends a proper envelope. Then check the row:

```sql
SELECT id, telegram_username,
       envelope_ciphertext IS NOT NULL AS has_ct,
       envelope_nonce IS NOT NULL AS has_nonce,
       wrapped_dek IS NOT NULL AS has_wrapped
FROM wallets
ORDER BY id DESC
LIMIT 3;
```

## 3) Status: `has_wallet_envelope`

```bash
curl -sS -X POST "http://localhost:3000/api/wallet/status" \
  -H "Content-Type: application/json" \
  -d '{"initData":"<paste valid initData>"}'
```

Expect `"has_wallet_envelope": true` when the row has all three envelope fields.

## 4) Verify decrypt (ops only — does **not** return the mnemonic)

Set in `.env`:

```bash
WALLET_ENVELOPE_VERIFY_SECRET=$(openssl rand -hex 32)
```

Redeploy / restart `vercel dev`.

```bash
curl -sS -X POST "http://localhost:3000/api/wallet/envelope-verify" \
  -H "Content-Type: application/json" \
  -H "x-wallet-envelope-verify-secret: $WALLET_ENVELOPE_VERIFY_SECRET" \
  -d '{"initData":"<same initData>"}'
```

Success looks like:

```json
{
  "ok": true,
  "wallet_id": 1,
  "telegram_username": "...",
  "plaintext_byte_length": 1234,
  "mnemonic_word_count": 24,
  "plaintext_json_valid": true
}
```

Server logs (stderr) line: `[wallet-envelope-verify] roundtrip_ok` with **no** mnemonic text.

- `401` — wrong/missing secret
- `503` — `WALLET_ENVELOPE_VERIFY_SECRET` unset
- `422` — wallet row exists but envelope columns empty (old row or failed register)

## 5) Optional register diagnostics

```bash
WALLET_ENVELOPE_DEBUG=1
```

Log line: `[wallet-register] envelope_persisted` with `telegram_username` and `wallet_id` only.
