import { describe, expect, it } from 'vitest'
import { DecisionAsk } from './decision-client'
import { DecisionAdapter, HttpDecisionClient } from './http-decision-client'

// A made-up vendor: the client's own behaviour is tested here once, each real vendor's request and answer shapes in its own spec.
const adapter: DecisionAdapter = {
  name: 'Test Decisions',
  defaultModel: 'test-1',
  url: (baseUrl) => `${baseUrl ?? 'https://decisions.test'}/decide`,
  headers: (apiKey) => ({ 'x-key': apiKey }),
  body: (model, ask) => ({ model, input: ask.input, question: ask.code }),
  probability: (json) => {
    const p = (json as { p?: unknown }).p
    return typeof p === 'number' && p >= 0 && p <= 1 ? p : undefined
  },
}

const ask = (code: DecisionAsk['code'], input: string): DecisionAsk => ({ code, input, sentence: null })

function fakeFetch(reply: (n: number) => { body: unknown; status?: number }) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    const { body, status = 200 } = reply(calls.length)
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { calls, fetchFn }
}

describe('HttpDecisionClient', () => {
  it('makes one call per ask, answers in the same order, and says a decision model answered with which model', async () => {
    const { calls, fetchFn } = fakeFetch((n) => ({ body: { p: n === 0 ? 0.9 : 0.1 } }))
    const out = await new HttpDecisionClient(adapter, { apiKey: 'k', fetchFn }).decide([ask('invitation', 'a'), ask('own_account', 'b')])
    expect(out).toEqual([
      { ...ask('invitation', 'a'), probability: 0.9, answeredBy: 'jev', model: 'test-1' },
      { ...ask('own_account', 'b'), probability: 0.1, answeredBy: 'jev', model: 'test-1' },
    ])
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ model: 'test-1', input: 'a', question: 'invitation' })
  })

  it('sends the adapter headers and body as JSON, with a time limit, to the adapter url', async () => {
    const { calls, fetchFn } = fakeFetch(() => ({ body: { p: 0.5 } }))
    await new HttpDecisionClient(adapter, { apiKey: 'secret', model: 'test-2', baseUrl: 'https://other.test', fetchFn }).decide([ask('invitation', 'a')])
    expect(calls[0].url).toBe('https://other.test/decide')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers).toEqual({ 'Content-Type': 'application/json', 'x-key': 'secret' })
    expect(JSON.parse(calls[0].init.body as string).model).toBe('test-2')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('names the vendor, the status, the question and the provider error code when a call fails', async () => {
    const { fetchFn } = fakeFetch(() => ({ body: { error: { code: 'rate_limit_exceeded' } }, status: 429 }))
    await expect(new HttpDecisionClient(adapter, { apiKey: 'k', fetchFn }).decide([ask('invitation', 'a')])).rejects.toThrow('Test Decisions answered 429 for invitation (rate_limit_exceeded)')
  })

  it('rejects an answer the adapter cannot read as a probability', async () => {
    for (const bad of [{ p: 1.4 }, { p: 'high' }, {}]) {
      const { fetchFn } = fakeFetch(() => ({ body: bad }))
      await expect(new HttpDecisionClient(adapter, { apiKey: 'k', fetchFn }).decide([ask('invitation', 'a')])).rejects.toThrow('invalid decision answer for invitation')
    }
  })
})
