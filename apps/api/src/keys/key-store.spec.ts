import 'reflect-metadata'
import { randomBytes } from 'node:crypto'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Setting } from '../setting.entity'
import { createTestDataSource } from '../test/db'
import { KeyStore } from './key-store'

let ds: DataSource
const TOKEN_KEY = randomBytes(32).toString('base64')
const env = (vars: Record<string, string> = {}) => ({ get: (k: string, d = '') => vars[k] ?? d })
const store = (vars: Record<string, string> = { TOKEN_KEY }) => new KeyStore(ds, env(vars))

beforeEach(async () => {
  ds = await createTestDataSource()
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('KeyStore', () => {
  it('stores keys encrypted, never in plain text, and another process reads them back', async () => {
    await store().save({ openaiApiKey: 'sk-proj-secret-1234', xClientSecret: 'x-secret-abcd' })
    const raw = JSON.stringify((await ds.getRepository(Setting).findOneByOrFail({ key: 'keys' })).value)
    expect(raw).not.toContain('sk-proj-secret-1234')
    expect(raw).not.toContain('x-secret-abcd')

    const worker = store()
    await worker.load()
    expect(worker.get('openaiApiKey')).toBe('sk-proj-secret-1234')
    expect(worker.get('xClientSecret')).toBe('x-secret-abcd')
  })

  it('a saved key wins over the .env one; clearing it falls back to .env', async () => {
    const s = store({ TOKEN_KEY, OPENAI_API_KEY: 'sk-from-env' })
    await s.load()
    expect(s.get('openaiApiKey')).toBe('sk-from-env')
    await s.save({ openaiApiKey: 'sk-saved' })
    expect(s.get('openaiApiKey')).toBe('sk-saved')
    await s.save({ openaiApiKey: '' })
    expect(s.get('openaiApiKey')).toBe('sk-from-env')
  })

  it('shows only the last 4 characters and where each key comes from, never the key', async () => {
    const s = store({ TOKEN_KEY, X_CLIENT_ID: 'client-id-from-env-WXYZ' })
    await s.load()
    await s.save({ openaiApiKey: 'sk-proj-secret-1234' })
    const view = s.view()
    expect(view).toEqual({
      xClientId: { set: true, last4: 'WXYZ', source: 'env' },
      xClientSecret: { set: false, last4: null, source: null },
      openaiApiKey: { set: true, last4: '1234', source: 'saved' },
    })
    expect(JSON.stringify(view)).not.toContain('secret')
  })

  it('refuses to save without TOKEN_KEY, so nothing is stored in plain text', async () => {
    await expect(store({}).save({ openaiApiKey: 'sk-x' })).rejects.toThrow('TOKEN_KEY')
    expect(await ds.getRepository(Setting).findOneBy({ key: 'keys' })).toBeNull()
  })

  it('a key that can no longer be decrypted (TOKEN_KEY changed) reads as not set instead of failing', async () => {
    await store().save({ openaiApiKey: 'sk-old' })
    const other = store({ TOKEN_KEY: randomBytes(32).toString('base64') })
    await other.load()
    expect(other.get('openaiApiKey')).toBe('')
  })

  it('forgets every saved key at once', async () => {
    const s = store()
    await s.save({ openaiApiKey: 'sk-1', xClientId: 'id', xClientSecret: 'secret' })
    await s.forgetAll()
    expect([s.get('openaiApiKey'), s.get('xClientId'), s.get('xClientSecret')]).toEqual(['', '', ''])
    expect(await ds.getRepository(Setting).findOneBy({ key: 'keys' })).toBeNull()
  })
})
