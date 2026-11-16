import { describe, expect, it } from 'vitest'
import { createAccessGuard, readSessionCookie } from './access-guard'

type Out = { status?: number; body?: unknown; passed: boolean }

async function run(path: string, opts: { on: boolean; valid: boolean; cookie?: string }): Promise<Out> {
  const out: Out = { passed: false }
  const access = { on: opts.on, verify: async (c: string | undefined) => opts.valid && c === 'good' }
  const guard = createAccessGuard(access)
  const req = { path, headers: opts.cookie ? { cookie: opts.cookie } : {} }
  const res = { status: (code: number) => ({ json: (body: unknown) => Object.assign(out, { status: code, body }) }) }
  await guard(req, res, () => (out.passed = true))
  return out
}

describe('access guard', () => {
  it('lets everything through when the gate is off', async () => {
    expect((await run('/api/campaigns', { on: false, valid: false })).passed).toBe(true)
  })

  it('answers 401 for any API call without a valid session', async () => {
    for (const path of ['/api/campaigns', '/api/keys', '/api/auth/x/login', '/api/drafts/1/approve', '/api/access/sign-out-everywhere']) {
      expect(await run(path, { on: true, valid: true })).toMatchObject({ passed: false, status: 401 })
    }
    expect(await run('/api/campaigns', { on: true, valid: false, cookie: 'xdm_session=bad' })).toMatchObject({ passed: false, status: 401 })
  })

  it('ignores letter case in the API prefix and the open calls, because the router does too', async () => {
    for (const path of ['/API/keys', '/Api/campaigns', '/api/Keys']) {
      expect(await run(path, { on: true, valid: false })).toMatchObject({ passed: false, status: 401 })
    }
    expect((await run('/API/health', { on: true, valid: false })).passed).toBe(true)
  })

  it('lets a valid session through', async () => {
    expect((await run('/api/campaigns', { on: true, valid: true, cookie: 'theme=dark; xdm_session=good' })).passed).toBe(true)
  })

  it('keeps the health check, the sign-in calls and the web page open, so a stranger sees only the sign-in screen', async () => {
    for (const path of ['/api/health', '/api/access', '/api/access/set-up', '/api/access/sign-in', '/api/access/sign-out', '/', '/assets/index.js']) {
      expect((await run(path, { on: true, valid: false })).passed).toBe(true)
    }
  })

  it('reads the session cookie among others', () => {
    expect(readSessionCookie('a=1; xdm_session=abc.def; b=2')).toBe('abc.def')
    expect(readSessionCookie(undefined)).toBeUndefined()
  })
})
