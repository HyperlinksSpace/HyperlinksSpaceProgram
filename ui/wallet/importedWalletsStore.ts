/**
 * Client-only imported wallets (recovery-phrase). Multi-network ready; TON first.
 * Mnemonics stay on-device — never sent to the API.
 *
 * Storage:
 * - Device AES key → OS secure store on iOS/Android when available; else localStorage
 * - Wallet list metadata → localStorage
 * - Per-wallet mnemonic ciphertext → secure store when available; else alongside list
 */

import { createSeedCipher } from "../../services/wallet/tonWallet";
import {
  deleteLocalSecret,
  readLocalJsonSync,
  readLocalSecret,
  writeLocalJsonSync,
  writeLocalSecret,
} from "./localSecretStorage";

/** Extensible network id — UI can add more without reshaping storage. */
export type ImportedWalletNetworkId = "ton";

export type ImportedWalletRecord = {
  id: string;
  network: ImportedWalletNetworkId;
  address: string;
  friendlyAddress?: string | null;
  name?: string | null;
  wordCount: 12 | 24;
  /** AES-GCM blob from createSeedCipher — never log / never upload. */
  mnemonicCipher: string;
  addedAt: number;
};

const LIST_KEY = "hsp.importedWallets.v1";
const DEVICE_KEY = "hsp.importedWallets.deviceKey.v1";
const MNEMONIC_SECRET_PREFIX = "hsp.importedWallets.mnemonic.";
const MAX_WALLETS = 12;

type ListListener = () => void;
const listeners = new Set<ListListener>();
let cached: ImportedWalletRecord[] | null = null;
let deviceKeyCache: string | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function normalizeAddressKey(address: string): string {
  return address.trim().toLowerCase();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa === "function") return btoa(binary);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require("buffer") as typeof import("buffer");
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require("buffer") as typeof import("buffer");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function getOrCreateDeviceKey(): Promise<string> {
  if (deviceKeyCache) return deviceKeyCache;
  const existing = await readLocalSecret(DEVICE_KEY);
  if (existing && existing.trim()) {
    deviceKeyCache = existing.trim();
    return deviceKeyCache;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const next = bytesToBase64(bytes);
  await writeLocalSecret(DEVICE_KEY, next);
  deviceKeyCache = next;
  return next;
}

async function decryptMnemonic(cipher: string, masterKey: string): Promise<string[] | null> {
  try {
    const parts = cipher.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const iv = base64ToBytes(parts[1]!);
    const data = base64ToBytes(parts[2]!);
    const rawKey = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(masterKey)),
    );
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, data);
    const text = new TextDecoder().decode(plain).trim();
    const words = text.split(/\s+/).filter(Boolean);
    return words.length >= 12 ? words : null;
  } catch {
    return null;
  }
}

function mnemonicSecretKey(id: string): string {
  return `${MNEMONIC_SECRET_PREFIX}${id}`;
}

function parseList(raw: string | null): ImportedWalletRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is ImportedWalletRecord => {
        if (row == null || typeof row !== "object") return false;
        const r = row as ImportedWalletRecord;
        return (
          typeof r.id === "string" &&
          typeof r.address === "string" &&
          r.address.trim().length > 0 &&
          r.network === "ton" &&
          (r.wordCount === 12 || r.wordCount === 24) &&
          typeof r.mnemonicCipher === "string"
        );
      })
      .map((row) => ({
        id: row.id,
        network: "ton" as const,
        address: row.address.trim(),
        friendlyAddress: row.friendlyAddress?.trim() || null,
        name: row.name?.trim() || null,
        wordCount: row.wordCount,
        mnemonicCipher: row.mnemonicCipher,
        addedAt:
          typeof row.addedAt === "number" && Number.isFinite(row.addedAt) ? row.addedAt : 0,
      }))
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, MAX_WALLETS);
  } catch {
    return [];
  }
}

function readRaw(): ImportedWalletRecord[] {
  return parseList(readLocalJsonSync(LIST_KEY));
}

function writeRaw(rows: ImportedWalletRecord[]): void {
  writeLocalJsonSync(LIST_KEY, JSON.stringify(rows.slice(0, MAX_WALLETS)));
  cached = rows.slice(0, MAX_WALLETS);
  emit();
}

export function readImportedWallets(): ImportedWalletRecord[] {
  if (cached) return cached;
  cached = readRaw();
  return cached;
}

export function subscribeImportedWallets(listener: ListListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function importWalletFromMnemonic(opts: {
  network: ImportedWalletNetworkId;
  mnemonic: string[];
  address: string;
  name?: string | null;
}): Promise<ImportedWalletRecord> {
  const words = opts.mnemonic.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const address = opts.address.trim();
  if (!address || (words.length !== 12 && words.length !== 24)) {
    throw new Error("invalid_import");
  }
  const masterKey = await getOrCreateDeviceKey();
  const mnemonicCipher = await createSeedCipher(masterKey, words.join(" "));
  const prev = readImportedWallets().filter(
    (row) =>
      !(
        row.network === opts.network &&
        normalizeAddressKey(row.address) === normalizeAddressKey(address)
      ),
  );
  const record: ImportedWalletRecord = {
    id: `imported:${opts.network}:${normalizeAddressKey(address)}`,
    network: opts.network,
    address,
    friendlyAddress: address,
    name: opts.name?.trim() || null,
    wordCount: words.length === 12 ? 12 : 24,
    mnemonicCipher,
    addedAt: Date.now(),
  };
  // Prefer OS secure store for the ciphertext; list still keeps a copy for web fallback.
  await writeLocalSecret(mnemonicSecretKey(record.id), mnemonicCipher);
  writeRaw([record, ...prev]);
  return record;
}

export async function readImportedWalletMnemonic(
  idOrAddress: string,
): Promise<string[] | null> {
  const key = idOrAddress.trim().toLowerCase();
  const row = readImportedWallets().find(
    (r) => r.id.toLowerCase() === key || normalizeAddressKey(r.address) === key,
  );
  if (!row) return null;
  const fromSecure = await readLocalSecret(mnemonicSecretKey(row.id));
  const cipher = (fromSecure && fromSecure.trim()) || row.mnemonicCipher;
  return decryptMnemonic(cipher, await getOrCreateDeviceKey());
}

export function removeImportedWallet(idOrAddress: string): ImportedWalletRecord[] {
  const key = idOrAddress.trim().toLowerCase();
  const removed = readImportedWallets().filter(
    (r) => r.id.toLowerCase() === key || normalizeAddressKey(r.address) === key,
  );
  const next = readImportedWallets().filter(
    (r) => r.id.toLowerCase() !== key && normalizeAddressKey(r.address) !== key,
  );
  for (const row of removed) {
    void deleteLocalSecret(mnemonicSecretKey(row.id));
  }
  writeRaw(next);
  return next;
}
