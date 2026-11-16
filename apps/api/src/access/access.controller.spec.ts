import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { AccessController } from './access.controller'
import type { AccessService } from './access.service'

type Cookie = { name: string; value: string; opts: Record<string, unknown> }
const response = () => {
  const set: Cookie[] = []
  return { set, res: { cookie: (name: string, value: string, opts: Record<string, unknown>) => set.push({ name, value, opts }), clearCookie: (name: string) => set.push({ name, value: '', opts: { cleared: true } }) } }
}
const req = (cookie?: string) => ({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.2', ...(cookie && { cookie }) }, socket: { remoteAddress: '10.0.0.2' } })
const service = { on: true, setUp: async () => 'sess', signIn: async () => 'sess', state: async () => ({ gate: true, setUp: true }), verify: async (c?: string) => c === 'sess', signOutEverywhere: async () => undefined } as unknown as AccessService

describe('AccessController', () => {
  it('sets the session cookie HttpOnly, Secure, SameSite=Lax, for the whole site, 30 days', async () => {
    const { set, res } = response()
    await new AccessController(service).signIn({ password: 'correct horse battery' }, req() as never, res as never)
    expect(set).toEqual([{ name: 'xdm_session', value: 'sess', opts: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 86_400_000 } }])
  })

  it('passes on the address the request came from, as the proxy saw it', async () => {
    let from: string | undefined
    const spy = { ...service, signIn: async (_p: string, _n: Date, f?: string) => ((from = f), 'sess') } as unknown as AccessService
    await new AccessController(spy).signIn({ password: 'correct horse battery' }, req() as never, response().res as never)
    expect(from).toBe('203.0.113.5')
  })

  it('says whether this browser is signed in', async () => {
    expect(await new AccessController(service).state(req('xdm_session=sess') as never)).toEqual({ gate: true, setUp: true, signedIn: true })
    expect(await new AccessController(service).state(req() as never)).toEqual({ gate: true, setUp: true, signedIn: false })
  })

  it('signing out clears the cookie; signing out everywhere also voids every other session', async () => {
    const { set, res } = response()
    let everywhere = false
    const spy = { ...service, signOutEverywhere: async () => void (everywhere = true) } as unknown as AccessService
    await new AccessController(spy).signOutEverywhere(req('xdm_session=sess') as never, res as never)
    expect(everywhere).toBe(true)
    expect(set).toEqual([{ name: 'xdm_session', value: '', opts: { cleared: true } }])
  })

  it('refuses a malformed body', async () => {
    await expect(new AccessController(service).signIn({}, req() as never, response().res as never)).rejects.toBeInstanceOf(BadRequestException)
  })
})
