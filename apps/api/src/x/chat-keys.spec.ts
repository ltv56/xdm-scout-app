import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { openKeys, sealKeys } from './chat-keys'

const tokenKey = randomBytes(32).toString('base64')

describe('chat keys', () => {
  it('round-trips raw key bytes', () => {
    const keys = new Uint8Array(randomBytes(64))
    expect(openKeys(sealKeys(keys, tokenKey), tokenKey)).toEqual(keys)
  })

  it('refuses a wrong TOKEN_KEY', () => {
    const sealed = sealKeys(new Uint8Array(randomBytes(64)), tokenKey)
    expect(() => openKeys(sealed, randomBytes(32).toString('base64'))).toThrow()
  })
})
