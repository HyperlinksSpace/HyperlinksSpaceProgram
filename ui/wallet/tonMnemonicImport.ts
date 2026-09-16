import { mnemonicToPrivateKey, mnemonicValidate, mnemonicWordList } from "@ton/crypto";
import {
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from "@ton/ton";
import { Buffer as BufferPolyfill } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;
}

export type TonMnemonicWordCount = 12 | 24;

export type DerivedTonWalletVariant = "v5r1" | "v4r2" | "v3r2";

/** BIP-39 / TON shared English word list (2048). */
export const TON_MNEMONIC_WORDLIST: readonly string[] = mnemonicWordList;

export function normalizeMnemonicInput(raw: string): string[] {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function suggestMnemonicWords(prefix: string, limit = 6): string[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  const out: string[] = [];
  for (const word of TON_MNEMONIC_WORDLIST) {
    if (word.startsWith(p)) {
      out.push(word);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Validate a TON recovery phrase.
 * `@ton/crypto` supports both 12- and 24-word TON mnemonics (TEP-0003 also
 * documents Multichain BIP-39 12-word; this path covers TON-native phrases).
 */
export async function validateTonMnemonic(
  words: string[],
): Promise<{ ok: true; wordCount: TonMnemonicWordCount } | { ok: false; reason: string }> {
  if (words.length !== 12 && words.length !== 24) {
    return { ok: false, reason: "word_count" };
  }
  for (const word of words) {
    if (!TON_MNEMONIC_WORDLIST.includes(word)) {
      return { ok: false, reason: "unknown_word" };
    }
  }
  const valid = await mnemonicValidate(words);
  if (!valid) return { ok: false, reason: "checksum" };
  return { ok: true, wordCount: words.length === 12 ? 12 : 24 };
}

function friendlyNonBounceable(
  address: { toString: (opts: object) => string },
  testnet: boolean,
): string {
  return address.toString({
    bounceable: false,
    urlSafe: true,
    testOnly: testnet,
  });
}

/** Candidate addresses for common TON wallet contract versions (same seed). */
export async function deriveTonAddressCandidatesFromMnemonic(
  words: string[],
  opts?: { testnet?: boolean; workchain?: number },
): Promise<Array<{ variant: DerivedTonWalletVariant; address: string }>> {
  const keyPair = await mnemonicToPrivateKey(words);
  const workchain = opts?.workchain ?? 0;
  const testnet = opts?.testnet ?? false;
  const publicKey = keyPair.publicKey;

  const v5 = WalletContractV5R1.create({ workchain, publicKey });
  const v4 = WalletContractV4.create({ workchain, publicKey });
  const v3 = WalletContractV3R2.create({ workchain, publicKey });

  return [
    { variant: "v5r1", address: friendlyNonBounceable(v5.address, testnet) },
    { variant: "v4r2", address: friendlyNonBounceable(v4.address, testnet) },
    { variant: "v3r2", address: friendlyNonBounceable(v3.address, testnet) },
  ];
}

type ProbeResult = {
  address: string;
  status: string | null;
  nativeBalance: number;
  jettonCount: number;
};

async function probeTonAccount(address: string): Promise<ProbeResult | null> {
  try {
    const url = `/api/ton-account-holdings?address=${encodeURIComponent(address)}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string | null;
      nativeBalance?: number;
      jettons?: unknown[];
    };
    return {
      address,
      status: typeof data.status === "string" ? data.status : null,
      nativeBalance:
        typeof data.nativeBalance === "number" && Number.isFinite(data.nativeBalance)
          ? data.nativeBalance
          : 0,
      jettonCount: Array.isArray(data.jettons) ? data.jettons.length : 0,
    };
  } catch {
    return null;
  }
}

function scoreProbe(probe: ProbeResult | null): number {
  if (!probe) return -1;
  let score = 0;
  const status = (probe.status ?? "").toLowerCase();
  if (status === "active") score += 100;
  if (probe.nativeBalance > 0) score += 50 + Math.min(probe.nativeBalance, 10);
  if (probe.jettonCount > 0) score += 25 + Math.min(probe.jettonCount, 10);
  return score;
}

/**
 * Derive the friendly address users expect for a recovery phrase.
 * Prefer the wallet version that already exists / holds assets on-chain
 * (Tonkeeper defaults to V5; older wallets are often V4 / V3).
 */
export async function deriveTonAddressFromMnemonic(
  words: string[],
  opts?: { testnet?: boolean; workchain?: number },
): Promise<string> {
  const candidates = await deriveTonAddressCandidatesFromMnemonic(words, opts);
  const probes = await Promise.all(candidates.map((c) => probeTonAccount(c.address)));

  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < candidates.length; i += 1) {
    const score = scoreProbe(probes[i] ?? null);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // Empty / uninitialized: prefer Wallet V5R1 (current Tonkeeper default).
  return candidates[bestIndex]?.address ?? candidates[0]!.address;
}
