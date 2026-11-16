import { describe, expect, it } from 'vitest'
import { fetchWithRetry, retryDelayMs } from './retry'

const answers = (...list: (number | Error)[]) => {
  let n = 0
  const fetchFn = (async () => {
    const next = list[Math.min(n++, list.length - 1)]
    if (next instanceof Error) throw next
    return new Response('{}', { status: next, headers: next === 429 ? { 'retry-after-ms': '5' } : {} })
  }) as unknown as typeof fetch
  return { fetchFn, calls: () => n }
}
const waited: number[] = []
const sleep = async (ms: number) => void waited.push(ms)

describe('fetchWithRetry, as the official OpenAI SDK does', () => {
  it('tries a rate limit or server error again, waiting what the API asks', async () => {
    const { fetchFn, calls } = answers(429, 503, 200)
    waited.length = 0
    expect((await fetchWithRetry(fetchFn, 'https://x', {}, sleep)).status).toBe(200)
    expect(calls()).toBe(3)
    expect(waited[0]).toBe(5)
  })

  it('stops after two retries and hands back the last answer', async () => {
    const { fetchFn, calls } = answers(429)
    expect((await fetchWithRetry(fetchFn, 'https://x', {}, sleep)).status).toBe(429)
    expect(calls()).toBe(3)
  })

  it('does not retry a request the API refused, and retries a dropped connection', async () => {
    const bad = answers(400, 200)
    expect((await fetchWithRetry(bad.fetchFn, 'https://x', {}, sleep)).status).toBe(400)
    expect(bad.calls()).toBe(1)
    const dropped = answers(new TypeError('fetch failed'), 200)
    expect((await fetchWithRetry(dropped.fetchFn, 'https://x', {}, sleep)).status).toBe(200)
  })

  it('backs off from half a second up to eight without a Retry-After', () => {
    const none = new Headers()
    expect(retryDelayMs(none, 0, () => 0)).toBe(500)
    expect(retryDelayMs(none, 1, () => 0)).toBe(1000)
    expect(retryDelayMs(none, 9, () => 0)).toBe(8000)
    expect(retryDelayMs(new Headers({ 'retry-after': '2' }), 0)).toBe(2000)
  })
})
