import { LlmClient, LlmRequest, LlmUsageSink } from './llm-client'

const TIMEOUT_MS = 60_000

// Models sometimes wrap JSON in a code fence; anything unparsable becomes null so the caller can retry.
function parseJson(text: string): unknown {
  const body = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function post(fetchFn: typeof fetch, url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new HttpError(res.status, await apiMessage(res))
  return res.json()
}

// A failing sink (a database hiccup) must never turn a good answer into an error.
function report(sink: LlmUsageSink | undefined, model: string, req: LlmRequest, inputTokens: unknown, outputTokens: unknown) {
  if (!sink || typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return
  try {
    sink({ model, task: req.task, inputTokens, outputTokens, meter: req.meter ?? null })
  } catch (err) {
    console.error('llm usage report failed', err)
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`LLM request failed with ${status}${detail ? `: ${detail}` : ''}`)
  }
}

// What the API said, short, so a 400 says why. The request carries the key in a header, never in the body, so nothing secret is echoed.
async function apiMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string }
    const msg = typeof body.error === 'string' ? body.error : body.error?.message
    return (msg ?? '').replace(/\s+/g, ' ').slice(0, 200)
  } catch {
    return ''
  }
}

// OpenAI reasoning models reject any temperature but the default.
const fixedTemperature = (model: string) => /^(openai\/)?(gpt-5|o\d)/i.test(model)

export class OpenAiCompatibleLlmClient implements LlmClient {
  constructor(
    private readonly cfg: { baseUrl: string; apiKey: string; model: string },
    private readonly fetchFn: typeof fetch = fetch,
    private readonly onUsage?: LlmUsageSink,
  ) {}

  // Some models fix their own temperature and refuse 0; once the API says so, stop sending it.
  private sendTemperature = true

  async completeJson(req: LlmRequest): Promise<unknown> {
    const url = `${this.cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const headers = { Authorization: `Bearer ${this.cfg.apiKey}` }
    const body = () => ({
      model: this.cfg.model,
      ...(this.sendTemperature && !fixedTemperature(this.cfg.model) && { temperature: 0 }),
      // OpenRouter holds credit for the model's full output length when none is given (65k tokens on some).
      ...(/openrouter\.ai/i.test(this.cfg.baseUrl) && { max_tokens: 8000 }),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    })
    let data: { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    try {
      data = (await post(this.fetchFn, url, headers, body())) as typeof data
    } catch (err) {
      if (!(this.sendTemperature && err instanceof HttpError && err.status === 400 && /temperature/i.test(err.detail))) throw err
      this.sendTemperature = false
      data = (await post(this.fetchFn, url, headers, body())) as typeof data
    }
    report(this.onUsage, this.cfg.model, req, data.usage?.prompt_tokens, data.usage?.completion_tokens)
    return parseJson(data.choices?.[0]?.message?.content ?? '')
  }
}

export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly cfg: { apiKey: string; model: string },
    private readonly fetchFn: typeof fetch = fetch,
    private readonly onUsage?: LlmUsageSink,
  ) {}

  async completeJson(req: LlmRequest): Promise<unknown> {
    const data = (await post(
      this.fetchFn,
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': this.cfg.apiKey, 'anthropic-version': '2023-06-01' },
      { model: this.cfg.model, max_tokens: 2000, temperature: 0, system: req.system, messages: [{ role: 'user', content: req.user }] },
    )) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
    report(this.onUsage, this.cfg.model, req, data.usage?.input_tokens, data.usage?.output_tokens)
    return parseJson(data.content?.find((c) => c.type === 'text')?.text ?? '')
  }
}
