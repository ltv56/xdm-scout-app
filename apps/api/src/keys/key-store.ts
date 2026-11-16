import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { decryptToken, encryptToken } from '../auth/token-crypto'
import { Setting } from '../setting.entity'
import type { KeyName, KeysView } from './contract'

const ENV_NAME: Record<KeyName, string> = { xClientId: 'X_CLIENT_ID', xClientSecret: 'X_CLIENT_SECRET', openaiApiKey: 'OPENAI_API_KEY' }
const NAMES = Object.keys(ENV_NAME) as KeyName[]
const ROW = 'keys'
// The config the key store and the Keys page read (.env names); ConfigService in the app.
export const KEYS_ENV = Symbol('KEYS_ENV')
// The API and the worker are separate processes: each reads the saved keys again this often.
const RELOAD_MS = 15_000

// ConfigService in the app; a plain object in tests.
type Env = { get(key: string, defaultValue?: string): string | undefined }

// Keys the operator saves on the Keys page, encrypted with TOKEN_KEY (which stays in the server's .env, never in the database).
// A saved key wins over the .env one, so a hosted deploy needs no keys in its .env.
@Injectable()
export class KeyStore implements OnModuleInit, OnModuleDestroy {
  private saved: Partial<Record<KeyName, string>> = {}
  private timer?: NodeJS.Timeout

  constructor(
    private readonly ds: DataSource,
    private readonly env: Env,
  ) {}

  async onModuleInit() {
    await this.load()
    this.timer = setInterval(() => void this.load().catch((err: unknown) => console.error('keys not reloaded', err)), RELOAD_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  async load() {
    const row = await this.ds.getRepository(Setting).findOneBy({ key: ROW })
    const stored = (row?.value ?? {}) as Partial<Record<KeyName, string>>
    const next: Partial<Record<KeyName, string>> = {}
    for (const name of NAMES) {
      const enc = stored[name]
      if (!enc) continue
      try {
        next[name] = decryptToken(enc, this.tokenKey())
      } catch {
        // TOKEN_KEY changed or is missing: the key is unreadable, so it counts as not set and must be entered again.
      }
    }
    this.saved = next
  }

  get(name: KeyName): string {
    return this.saved[name] || this.env.get(ENV_NAME[name], '') || ''
  }

  // Empty string clears a saved key (the .env one, if any, applies again).
  async save(patch: Partial<Record<KeyName, string>>) {
    const key = this.tokenKey()
    if (!key) throw new Error('Set TOKEN_KEY in the server .env before saving keys: keys are only stored encrypted.')
    const next = { ...this.saved }
    for (const name of NAMES) {
      const value = patch[name]
      if (value === undefined) continue
      if (value.trim()) next[name] = value.trim()
      else delete next[name]
    }
    const stored = Object.fromEntries(Object.entries(next).map(([name, value]) => [name, encryptToken(value, key)]))
    await this.ds.getRepository(Setting).save({ key: ROW, value: stored })
    this.saved = next
  }

  async forgetAll() {
    await this.ds.getRepository(Setting).delete({ key: ROW })
    this.saved = {}
  }

  view(): KeysView {
    const out = {} as KeysView
    for (const name of NAMES) {
      const value = this.get(name)
      out[name] = { set: !!value, last4: value ? value.slice(-4) : null, source: this.saved[name] ? 'saved' : value ? 'env' : null }
    }
    return out
  }

  private tokenKey() {
    return this.env.get('TOKEN_KEY', '') ?? ''
  }
}
