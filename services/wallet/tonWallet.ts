import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { Buffer as BufferPolyfill } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa === "function") return btoa(binary);
  return BufferPolyfill.from(bytes).toString("base64");
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest);
}

export async function generateMnemonic(words = 24): Promise<string[]> {
  return mnemonicNew(words);
}

export async function deriveAddressFromMnemonic(opts: {
  mnemonic: string[];
  testnet?: boolean;
  workchain?: number;
}): Promise<string> {
  const { mnemonic, testnet = false, workchain = 0 } = opts;
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({
    workchain,
    publicKey: keyPair.publicKey,
  });
  return wallet.address.toString({
    bounceable: false,
    urlSafe: true,
    testOnly: testnet,
  });
}

export async function deriveMasterKeyFromMnemonic(mnemonic: string[]): Promise<string> {
  const bytes = await sha256Bytes(mnemonic.join(" "));
  return bytesToBase64(bytes);
}

export async function createSeedCipher(
  masterKey: string,
  seed: string,
): Promise<string> {
  const rawKey = new Uint8Array(await sha256Bytes(masterKey));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    new TextEncoder().encode(seed),
  );

  const cipherBytes = new Uint8Array(encrypted);
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(cipherBytes)}`;
}

