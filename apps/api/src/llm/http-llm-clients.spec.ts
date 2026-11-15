import { describe, expect, it } from 'vitest'
import { AnthropicLlmClient, OpenAiCompatibleLlmClient } from './http-llm-clients'

type Call = { url: string; init: RequestInit }

function fetchReturning(status: number, body: unknown) {
  const calls: Call[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fetchFn, calls }
}

const req = { task: 'fit' as const, system: 'be strict', user: '{"evidence":[]}' }

describe('OpenAiCompatibleLlmClient', () => {
  it('posts a chat completion asking for a JSON object and parses the reply', async () => {
    const { fetchFn, calls } = fetchReturning(200, { choices: [{ message: { content: '{"fit":"strong"}' } }] })
    const client = new OpenAiCompatibleLlmClient({ baseUrl: 'https://llm.example/v1/', apiKey: 'k', model: 'm1' }, fetchFn)

    expect(await client.completeJson(req)).toEqual({ fit: 'strong' })

    expect(calls[0].url).toBe('https://llm.example/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({ model: 'm1', response_format: { type: 'json_object' } })
    expect(body.messages).toEqual([
      { role: 'system', content: 'be strict' },
      { role: 'user', content: '{"evidence":[]}' },
    ])
  })

  it('sends temperature 0, except to OpenAI reasoning models that only take the default', async () => {
    const bodyFor = async (model: string) => {
      const { fetchFn, calls } = fetchReturning(200, { choices: [{ message: { content: '{}' } }] })
      await new OpenAiCompatibleLlmClient({ baseUrl: 'https://x/v1', apiKey: 'k', model }, fetchFn).completeJson(req)
      return JSON.parse(String(calls[0].init.body))
    }
    expect((await bodyFor('m1')).temperature).toBe(0)
    for (const model of ['gpt-5-nano', 'openai/gpt-5-mini', 'o4-mini']) expect(await bodyFor(model)).not.toHaveProperty('temperature')
  })

  it('accepts JSON wrapped in a code fence', async () => {
    const { fetchFn } = fetchReturning(200, { choices: [{ message: { content: '```json\n{"a":1}\n```' } }] })
    const client = new OpenAiCompatibleLlmClient({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, fetchFn)
    expect(await client.completeJson(req)).toEqual({ a: 1 })
  })

  it('returns an unparsable reply as null so the caller can retry, and throws on HTTP errors', async () => {
    const bad = fetchReturning(200, { choices: [{ message: { content: 'sorry, no' } }] })
    expect(await new OpenAiCompatibleLlmClient({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, bad.fetchFn).completeJson(req)).toBeNull()

    const down = fetchReturning(500, { error: 'boom' })
    await expect(new OpenAiCompatibleLlmClient({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, down.fetchFn).completeJson(req)).rejects.toThrow(/500/)
  })
})

describe('OpenAiCompatibleLlmClient with a model that fixes its own temperature', () => {
  const refusal = { error: { message: "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.", param: 'temperature' } }

  function fetchRefusingTemperature() {
    const bodies: Record<string, unknown>[] = []
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      return 'temperature' in body
        ? new Response(JSON.stringify(refusal), { status: 400 })
        : new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })
    }) as typeof fetch
    return { fetchFn, bodies }
  }

  it('asks again without temperature when the API says it is not supported, and remembers that', async () => {
    const { fetchFn, bodies } = fetchRefusingTemperature()
    const client = new OpenAiCompatibleLlmClient({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, fetchFn)
    expect(await client.completeJson(req)).toEqual({ ok: true })
    expect(await client.completeJson(req)).toEqual({ ok: true })
    expect(bodies.map((b) => 'temperature' in b)).toEqual([true, false, false])
  })

  it('shows what the API said when a call fails for another reason', async () => {
    const { fetchFn } = fetchReturning(400, { error: { message: 'The model `nope` does not exist' } })
    const client = new OpenAiCompatibleLlmClient({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'nope' }, fetchFn)
    await expect(client.completeJson(req)).rejects.toThrow('LLM request failed with 400: The model `nope` does not exist')
  })
})

describe('AnthropicLlmClient', () => {
  it('posts to the messages endpoint with the api key header and parses the text block', async () => {
    const { fetchFn, calls } = fetchReturning(200, { content: [{ type: 'text', text: '{"supported":true}' }] })
    const client = new AnthropicLlmClient({ apiKey: 'sk', model: 'claude-x' }, fetchFn)

    expect(await client.completeJson({ ...req, task: 'verify' })).toEqual({ supported: true })

    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: 'claude-x',
      system: 'be strict',
      messages: [{ role: 'user', content: '{"evidence":[]}' }],
    })
  })
})
