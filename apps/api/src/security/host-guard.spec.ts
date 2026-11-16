import { describe, expect, it } from 'vitest'
import { createHostGuard, parseAllowedHosts } from './host-guard'

function run(opts: { method?: string; host?: string; origin?: string; extra?: string[] }) {
  const headers: Record<string, string> = {}
  if (opts.host !== undefined) headers.host = opts.host
  if (opts.origin !== undefined) headers.origin = opts.origin
  const res = { statusCode: 200, body: undefined as unknown, status(c: number) { this.statusCode = c; return this }, json(b: unknown) { this.body = b } }
  let nexted = false
  createHostGuard(parseAllowedHosts(opts.extra?.join(',')))({ method: opts.method ?? 'GET', headers } as never, res as never, () => { nexted = true })
  return { nexted, status: res.statusCode }
}

describe('host guard', () => {
  it('lets local hosts through, with and without a port', () => {
    for (const host of ['localhost:3001', '127.0.0.1:3040', '[::1]:3001', 'app:3001']) expect(run({ host }).nexted).toBe(true)
  })

  it('refuses a request whose Host is another name (DNS rebinding)', () => {
    expect(run({ host: 'evil.example:3001' })).toEqual({ nexted: false, status: 421 })
    expect(run({ host: undefined })).toEqual({ nexted: false, status: 421 })
  })

  it('refuses a write from a page on another site', () => {
    expect(run({ method: 'POST', host: 'localhost:3001', origin: 'https://evil.example' })).toEqual({ nexted: false, status: 403 })
    expect(run({ method: 'DELETE', host: 'localhost:3001', origin: 'null' })).toEqual({ nexted: false, status: 403 })
  })

  it('accepts a write from the local web app, even on another port', () => {
    expect(run({ method: 'POST', host: 'localhost:3001', origin: 'http://localhost:3000' }).nexted).toBe(true)
  })

  it('does not look at Origin for reads, and a write with no Origin passes', () => {
    expect(run({ method: 'GET', host: 'localhost:3001', origin: 'https://evil.example' }).nexted).toBe(true)
    expect(run({ method: 'POST', host: 'localhost:3001' }).nexted).toBe(true)
  })

  it('accepts a configured public host for both Host and Origin', () => {
    const extra = ['scout.example.com']
    expect(run({ method: 'POST', host: 'scout.example.com', origin: 'https://scout.example.com', extra }).nexted).toBe(true)
    expect(run({ method: 'POST', host: 'scout.example.com', origin: 'https://evil.example', extra }).status).toBe(403)
    expect(run({ host: 'scout.example.com' }).status).toBe(421)
  })
})
