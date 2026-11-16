import 'reflect-metadata'
import { BadRequestException, ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ActivityLog } from '../activity/activity-log.entity'
import { Setting } from '../setting.entity'
import { createTestDataSource } from '../test/db'
import { SenderAccount } from '../sending/entities'
import { AccessService } from './access.service'
import { handOver } from './hand-over'

let ds: DataSource
const env = (vars: Record<string, string>) => ({ get: (k: string, d = '') => vars[k] ?? d })
const gate = () => new AccessService(ds, env({ ACCESS_GATE: 'on', INVITE_CODE: 'invite-7f3a9c' }))
const PASSWORD = 'correct horse battery'
const now = new Date('2026-11-17T03:00:00Z')

beforeEach(async () => {
  ds = await createTestDataSource()
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('AccessService', () => {
  it('is off unless ACCESS_GATE=on, so local and sandbox runs need no sign-in', async () => {
    const off = new AccessService(ds, env({}))
    expect(await off.state()).toEqual({ gate: false, setUp: false })
    expect(await off.verify(undefined, now)).toBe(true)
  })

  it('the first owner needs the invite code from the server .env, and only one owner is ever set up', async () => {
    const access = gate()
    await expect(access.setUp('wrong-code', PASSWORD, now)).rejects.toBeInstanceOf(ForbiddenException)
    const cookie = await access.setUp('invite-7f3a9c', PASSWORD, now)
    expect(await access.verify(cookie, now)).toBe(true)
    expect(await access.state()).toEqual({ gate: true, setUp: true })
    await expect(access.setUp('invite-7f3a9c', 'another password!!', now)).rejects.toBeInstanceOf(ConflictException)
  })

  it('needs a password of at least 12 characters', async () => {
    await expect(gate().setUp('invite-7f3a9c', 'short', now)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('stores a scrypt hash, never the password', async () => {
    await gate().setUp('invite-7f3a9c', PASSWORD, now)
    const row = JSON.stringify((await ds.getRepository(Setting).findOneByOrFail({ key: 'access' })).value)
    expect(row).not.toContain(PASSWORD)
    expect(row).toMatch(/scrypt/)
  })

  it('signs in with the password and refuses a wrong one', async () => {
    const access = gate()
    await access.setUp('invite-7f3a9c', PASSWORD, now)
    expect(await access.verify(await access.signIn(PASSWORD, now), now)).toBe(true)
    await expect(access.signIn('wrong password here', now)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('refuses a missing, forged, expired or old-epoch cookie', async () => {
    const access = gate()
    const cookie = await access.setUp('invite-7f3a9c', PASSWORD, now)
    expect(await access.verify(undefined, now)).toBe(false)
    expect(await access.verify(cookie.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), now)).toBe(false)
    expect(await access.verify(cookie, new Date(now.getTime() + 31 * 86_400_000))).toBe(false)
    await access.signOutEverywhere()
    expect(await access.verify(cookie, now)).toBe(false)
  })

  it('locks sign-in for 15 minutes after 5 wrong passwords, even for the right one', async () => {
    const access = gate()
    await access.setUp('invite-7f3a9c', PASSWORD, now)
    for (let i = 0; i < 5; i++) await expect(access.signIn('wrong password here', now)).rejects.toBeInstanceOf(UnauthorizedException)
    const locked = await access.signIn(PASSWORD, now).catch((e: unknown) => e)
    expect(locked).toBeInstanceOf(HttpException)
    expect((locked as HttpException).getStatus()).toBe(429)
    expect(await access.verify(await access.signIn(PASSWORD, new Date(now.getTime() + 16 * 60_000)), now)).toBe(true)
  })

  it('logs the set-up, sign-ins, failed sign-ins and sign-out everywhere, with where they came from', async () => {
    const access = gate()
    await access.setUp('invite-7f3a9c', PASSWORD, now, '203.0.113.5')
    await access.signIn(PASSWORD, now, '203.0.113.5')
    await access.signIn('wrong password here', now, '198.51.100.7').catch(() => undefined)
    await access.signOutEverywhere('203.0.113.5')
    const log = await ds.getRepository(ActivityLog).find({ order: { id: 'ASC' } })
    expect(log.map((r) => [r.kind, r.detail])).toEqual([
      ['owner_set_up', 'from 203.0.113.5'],
      ['signed_in', 'from 203.0.113.5'],
      ['sign_in_failed', 'from 198.51.100.7'],
      ['signed_out_everywhere', 'from 203.0.113.5'],
    ])
  })
})

describe('handing the server over', () => {
  it('removes the owner, the saved keys and the X tokens, so the next invite code can set it up again', async () => {
    const access = gate()
    const cookie = await access.setUp('invite-7f3a9c', PASSWORD, now)
    await ds.getRepository(Setting).save({ key: 'keys', value: { openaiApiKey: 'encrypted' } })
    await ds.getRepository(SenderAccount).save({ xUserId: '100', handle: 'fund', accessTokenEnc: 'enc-a', refreshTokenEnc: 'enc-r' })

    await handOver(ds)

    expect(await access.state()).toEqual({ gate: true, setUp: false })
    expect(await access.verify(cookie, now)).toBe(false)
    expect(await ds.getRepository(Setting).findOneBy({ key: 'keys' })).toBeNull()
    expect(await ds.getRepository(SenderAccount).findOneByOrFail({ xUserId: '100' })).toMatchObject({ accessTokenEnc: null, refreshTokenEnc: null })
    expect((await ds.getRepository(ActivityLog).find()).map((r) => r.kind)).toContain('handed_over')
  })
})
