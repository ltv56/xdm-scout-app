import 'reflect-metadata'
import { randomBytes } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ActivityLog } from '../activity/activity-log.entity'
import { SenderAccount } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { KeyStore } from './key-store'
import { KeysController } from './keys.controller'

let ds: DataSource
let keys: KeyStore
let controller: KeysController
const vars = { TOKEN_KEY: randomBytes(32).toString('base64'), X_REDIRECT_URI: 'https://xdm.example.org/api/auth/x/callback' }
const env = { get: (k: string, d = '') => (vars as Record<string, string>)[k] ?? d }

beforeEach(async () => {
  ds = await createTestDataSource()
  keys = new KeyStore(ds, env)
  controller = new KeysController(ds, keys, env)
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('KeysController', () => {
  it('shows which keys are set, their last 4 characters and the callback URL to put in the X app', async () => {
    await controller.save({ openaiApiKey: 'sk-proj-abcd1234' })
    const page = controller.page()
    expect(page.callbackUrl).toBe('https://xdm.example.org/api/auth/x/callback')
    expect(page.canSave).toBe(true)
    expect(page.keys.openaiApiKey).toEqual({ set: true, last4: '1234', source: 'saved' })
    expect(JSON.stringify(page)).not.toContain('sk-proj-abcd1234')
  })

  it('logs which keys changed, never their values', async () => {
    await controller.save({ openaiApiKey: 'sk-proj-abcd1234', xClientId: 'client-id-9876' })
    await controller.save({ openaiApiKey: '' })
    const log = await ds.getRepository(ActivityLog).find({ order: { id: 'ASC' } })
    expect(log.map((r) => [r.kind, r.detail])).toEqual([
      ['keys_changed', 'Saved: X client ID, OpenAI key'],
      ['keys_changed', 'Cleared: OpenAI key'],
    ])
    expect(JSON.stringify(log)).not.toMatch(/sk-proj|client-id-9876/)
  })

  it('Forget everything removes the saved keys and the connected X account tokens, and logs it', async () => {
    await controller.save({ openaiApiKey: 'sk-proj-abcd1234' })
    await ds.getRepository(SenderAccount).save({ xUserId: '100', handle: 'fund', accessTokenEnc: 'enc-a', refreshTokenEnc: 'enc-r' })
    await controller.forget()
    expect(keys.get('openaiApiKey')).toBe('')
    expect(await ds.getRepository(SenderAccount).findOneByOrFail({ xUserId: '100' })).toMatchObject({ accessTokenEnc: null, refreshTokenEnc: null })
    expect((await ds.getRepository(ActivityLog).find()).map((r) => r.kind)).toContain('keys_forgotten')
  })

  it('refuses unknown fields and over-long values', async () => {
    await expect(controller.save({ password: 'x' })).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.save({ openaiApiKey: 'x'.repeat(301) })).rejects.toBeInstanceOf(BadRequestException)
  })
})
