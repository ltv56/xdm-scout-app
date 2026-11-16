import { z } from 'zod'
import { DecisionAnswer, DecisionAsk, DecisionClient } from './decision-client'
import { fetchWithRetry } from '../llm/retry'
import { errorCode } from './http-error'
import { QUESTIONS } from './questions'

// What differs between decision vendors. To add one, write an adapter and a three-line class (see the OpenAI client).
export interface DecisionAdapter {
  // Named in errors: "<name> answered 429 for invitation".
  name: string
  defaultModel: string
  url(baseUrl?: string): string
  headers(apiKey: string): Record<string, string>
  body(model: string, ask: DecisionAsk): unknown
  // The probability in a good answer, or undefined when the answer cannot be used.
  probability(json: unknown, ask: DecisionAsk): number | undefined
}

export type HttpDecisionConfig = { apiKey: string; model?: string; baseUrl?: string; fetchFn?: typeof fetch }

// One yes/no question per call, since each ask has its own input. A decision model returns only a probability, never text.
export class HttpDecisionClient implements DecisionClient {
  private readonly model: string
  private readonly fetchFn: typeof fetch

  constructor(
    private readonly adapter: DecisionAdapter,
    private readonly config: HttpDecisionConfig,
  ) {
    this.model = config.model ?? adapter.defaultModel
    this.fetchFn = config.fetchFn ?? fetch
  }

  async decide(asks: DecisionAsk[]): Promise<DecisionAnswer[]> {
    return Promise.all(asks.map((ask) => this.one(ask)))
  }

  private async one(ask: DecisionAsk): Promise<DecisionAnswer> {
    const res = await fetchWithRetry(this.fetchFn, this.adapter.url(this.config.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.adapter.headers(this.config.apiKey) },
      body: JSON.stringify(this.adapter.body(this.model, ask)),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`${this.adapter.name} answered ${res.status} for ${ask.code}${await errorCode(res)}`)
    const probability = this.adapter.probability(await res.json(), ask)
    if (probability === undefined) throw new Error(`invalid decision answer for ${ask.code}`)
    return { ...ask, probability, answeredBy: 'jev', model: this.model }
  }
}

// Helpers the adapters share.
export const instructions = (ask: DecisionAsk) => QUESTIONS[ask.code].instructions

const noulAnswers = z.object({ answers: z.record(z.string(), z.object({ type: z.string(), noul: z.number().min(0).max(1).optional() })) })
// Answers keyed by question code, each { type: 'noul', noul: 0..1 }: the System One and Gemini shape.
export function noulProbability(json: unknown, ask: DecisionAsk): number | undefined {
  const parsed = noulAnswers.safeParse(json)
  const answer = parsed.success ? parsed.data.answers[ask.code] : undefined
  return answer?.type === 'noul' ? answer.noul : undefined
}
