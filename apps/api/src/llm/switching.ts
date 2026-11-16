import { createHash } from 'node:crypto'
import type { DecisionAsk, DecisionClient } from '../decisions/decision-client'
import { AI_ENV_VARS, createDecisionClient, createLlmClient } from './ai-config'
import type { LlmClient, LlmMeter, LlmRequest, LlmUsageSink } from './llm-client'

type Env = Record<string, string | undefined>

// Keys can be saved on the Keys page while the app runs, so the clients are rebuilt whenever the model settings change.
const fingerprint = (env: Env) => createHash('sha256').update(JSON.stringify(AI_ENV_VARS.map((k) => env[k] ?? ''))).digest('hex')

// In live mode a missing key must stop the call: canned answers there would score real people at random.
const missingKey = (err: Error) => new Error(`${err.message}. Add the OpenAI key on Settings > Keys.`)

function rebuilt<T>(envOf: () => Env, build: (env: Env) => T) {
  let built: { fp: string; value: T | Error } | undefined
  return () => {
    const env = envOf()
    const fp = fingerprint(env)
    if (built?.fp !== fp) {
      let value: T | Error
      try {
        value = build(env)
      } catch (err) {
        value = err instanceof Error ? err : new Error(String(err))
      }
      built = { fp, value }
    }
    return built.value
  }
}

export class SwitchingLlmClient implements LlmClient {
  private readonly current: () => LlmClient | Error

  constructor(envOf: () => Env, onUsage?: LlmUsageSink) {
    this.current = rebuilt(envOf, (env) => createLlmClient(env, onUsage))
  }

  get model() {
    const c = this.current()
    return c instanceof Error ? undefined : c.model
  }

  async completeJson(req: LlmRequest): Promise<unknown> {
    const c = this.current()
    if (c instanceof Error) throw missingKey(c)
    return c.completeJson(req)
  }
}

export class SwitchingDecisionClient implements DecisionClient {
  private readonly current: () => DecisionClient | Error

  constructor(envOf: () => Env, llm: LlmClient, onUsage?: LlmUsageSink) {
    this.current = rebuilt(envOf, (env) => createDecisionClient(env, llm, onUsage))
  }

  async decide(asks: DecisionAsk[], meter?: LlmMeter) {
    const c = this.current()
    if (c instanceof Error) throw missingKey(c)
    return c.decide(asks, meter)
  }
}
