import { mnemonicToPrivateKey, mnemonicValidate, mnemonicWordList } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { Buffer as BufferPolyfill } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;
}

export type TonMnemonicWordCount = 12 | 24;

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

export async function deriveTonAddressFromMnemonic(
  words: string[],
  opts?: { testnet?: boolean; workchain?: number },
): Promise<string> {
  const keyPair = await mnemonicToPrivateKey(words);
  const wallet = WalletContractV4.create({
    workchain: opts?.workchain ?? 0,
    publicKey: keyPair.publicKey,
  });
  return wallet.address.toString({
    bounceable: false,
    urlSafe: true,
    testOnly: opts?.testnet ?? false,
  });
}
