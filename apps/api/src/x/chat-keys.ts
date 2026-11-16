import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

export type ChatKeys = { userId: string; signingKeyVersion: string; keys: Uint8Array }

// Layout like token-crypto: nonce(12) | auth tag(16) | ciphertext, base64. Raw bytes, not text.
export function sealKeys(keys: Uint8Array, tokenKey: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(tokenKey, 'base64'), nonce)
  const body = Buffer.concat([cipher.update(keys), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64')
}

export function openKeys(sealed: string, tokenKey: string): Uint8Array {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(tokenKey, 'base64'), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return new Uint8Array(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]))
}

// File written once by the export script: { userId, signingKeyVersion, keys } with keys sealed by TOKEN_KEY.
export function loadChatKeys(file: string, tokenKey: string): ChatKeys {
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { userId: string; signingKeyVersion: string; keys: string }
  return { userId: saved.userId, signingKeyVersion: saved.signingKeyVersion, keys: openKeys(saved.keys, tokenKey) }
}
