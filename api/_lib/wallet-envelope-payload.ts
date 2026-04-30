import { createDecipheriv } from 'node:crypto';

const GCM_TAG_LENGTH = 16;

/**
 * Decrypt payload produced by `buildWalletRegisterEnvelope` (Web Crypto AES-256-GCM).
 * Ciphertext from `subtle.encrypt` is concat(cipher, authTag).
 */
export function decryptWalletPayloadAesGcmV1(
  dek: Buffer,
  nonce: Buffer,
  ciphertextAndTag: Buffer,
): Buffer {
  if (nonce.length !== 12) {
    throw new Error('wallet_envelope_bad_nonce_len');
  }
  if (ciphertextAndTag.length < GCM_TAG_LENGTH) {
    throw new Error('wallet_envelope_ciphertext_too_short');
  }
  const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - GCM_TAG_LENGTH);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', dek, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
