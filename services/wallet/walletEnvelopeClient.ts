/**
 * Client-side envelope for POST /api/wallet/register:
 * random DEK + AES-256-GCM of mnemonic JSON; server wraps DEK with Cloud KMS and stores Neon columns.
 */
const DEK_LENGTH = 32;
const GCM_IV_LENGTH = 12;

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

import { Buffer as BufferPolyfill } from "buffer";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return BufferPolyfill.from(bytes).toString("base64");
}

export type WalletRegisterEnvelope = {
  wallet_payload_ciphertext: string;
  wallet_payload_nonce: string;
  dek: string;
};

/** Plaintext inside ciphertext: `{ "v": 1, "m": "<mnemonic phrase>" }` */
export async function buildWalletRegisterEnvelope(mnemonic: string[]): Promise<WalletRegisterEnvelope> {
  const dek = randomBytes(DEK_LENGTH);
  const iv = randomBytes(GCM_IV_LENGTH);
  const key = await crypto.subtle.importKey(
    "raw",
    dek as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, m: mnemonic.join(" ") }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain);
  const encBytes = new Uint8Array(encrypted);
  return {
    wallet_payload_ciphertext: bytesToBase64(encBytes),
    wallet_payload_nonce: bytesToBase64(iv),
    dek: bytesToBase64(dek),
  };
}
