import { DecisionClient, FixtureDecisionClient } from '../decisions/decision-client'
import { GeminiDecisionClient } from '../decisions/gemini-decision-client'
import { OpenAiDecisionClient } from '../decisions/openai-decision-client'
import { LlmDecisionClient } from '../decisions/llm-decision-client'
import { SystemOneDecisionClient } from '../decisions/system-one-decision-client'
import { cannedHandler, FakeLlmClient } from './fake-llm-client'
import { AnthropicLlmClient, OpenAiCompatibleLlmClient } from './http-llm-clients'
import { LlmClient, LlmUsageSink } from './llm-client'

export type Keys = { google?: string; openRouter?: string; anthropic?: string; openai?: string; deepseek?: string }
export type TextRoute = { provider: 'anthropic' | 'openai' | 'google' | 'openrouter' | 'deepseek'; model: string }
export type DecisionRoute = { kind: 'google-decision'; model: string } | { kind: 'openai-decision'; model: string } | { kind: 'system-one'; model: string } | { kind: 'llm'; route: TextRoute }

const BASE_URL = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com',
}

const KEY_NAME = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GOOGLE_API_KEY', openrouter: 'OPEN_ROUTER_API_KEY', deepseek: 'DEEPSEEK_API_KEY' }

// The maker's own key first, then OpenRouter. A name nobody recognises goes to OpenRouter and fails there if it is wrong.
export function routeText(model: string, keys: Keys): TextRoute | null {
  if (!model) return null
  const maker = /^claude/i.test(model) ? 'anthropic' : /^(gpt|o\d)/i.test(model) ? 'openai' : /^gemini/i.test(model) ? 'google' : /^deepseek/i.test(model) ? 'deepseek' : null
  if (maker && keys[maker]) return { provider: maker, model }
  if (maker && keys.openRouter) return { provider: 'openrouter', model: `${maker}/${model}` }
  if (maker) throw new Error(`No key for ${model}: set ${KEY_NAME[maker]} or ${KEY_NAME.openrouter}`)
  if (keys.openRouter) return { provider: 'openrouter', model }
  throw new Error(`Cannot tell which provider serves "${model}": set ${KEY_NAME.openrouter} to try it there`)
}

export function routeDecision(model: string, keys: Keys): DecisionRoute | null {
  if (!model) return null
  if (/^gemini-decision/i.test(model)) {
    if (!keys.google) throw new Error(`No key for ${model}: set ${KEY_NAME.google}`)
    return { kind: 'google-decision', model }
  }
  // gpt-6-luna is the only model the OpenAI Decisions API takes.
  if (/^gpt-6-luna/i.test(model)) {
    if (!keys.openai) throw new Error(`No key for ${model}: set ${KEY_NAME.openai}`)
    return { kind: 'openai-decision', model }
  }
  if (/jev|decid|decision|drex/i.test(model)) {
    if (!keys.openRouter) throw new Error(`No key for ${model}: set ${KEY_NAME.openrouter}`)
    return { kind: 'system-one', model }
  }
  const route = routeText(model, keys)
  return route && { kind: 'llm', route }
}

type Env = Record<string, string | undefined>

// The env names the app copies out of its config for the factories below; a key read by keysOf must be listed here.
// Prompts and checks are tuned and measured on this model; live runs use it unless LLM_MODEL says otherwise. The sandbox stays on canned answers.
export const LIVE_DEFAULT_MODEL = 'gpt-6-luna'
const modelOf = (env: Env) => env.LLM_MODEL || (env.X_MODE === 'live' ? LIVE_DEFAULT_MODEL : '')

export const AI_ENV_VARS = ['GOOGLE_API_KEY', 'OPEN_ROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'LLM_API_KEY', 'LLM_MODEL', 'DECISION_MODEL', 'X_MODE']

// LLM_API_KEY is the generic key; only the DeepSeek route falls back to it.
const keysOf = (env: Env): Keys => ({ deepseek: env.DEEPSEEK_API_KEY ?? env.LLM_API_KEY, google: env.GOOGLE_API_KEY, openRouter: env.OPEN_ROUTER_API_KEY, anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY })

function buildLlm(route: TextRoute, keys: Keys, onUsage?: LlmUsageSink): LlmClient {
  if (route.provider === 'anthropic') return new AnthropicLlmClient({ apiKey: keys.anthropic ?? '', model: route.model }, fetch, onUsage)
  const apiKey = ({ openai: keys.openai, google: keys.google, deepseek: keys.deepseek, openrouter: keys.openRouter }[route.provider]) ?? ''
  return new OpenAiCompatibleLlmClient({ apiKey, model: route.model, baseUrl: BASE_URL[route.provider] }, fetch, onUsage)
}

// LLM_MODEL empty = the canned client, so the app runs without any key.
export function createLlmClient(env: Env, onUsage?: LlmUsageSink): LlmClient {
  const keys = keysOf(env)
  const route = routeText(modelOf(env), keys)
  return route ? buildLlm(route, keys, onUsage) : new FakeLlmClient(cannedHandler)
}

// DECISION_MODEL empty: ask the LLM if there is one, else answer from fixtures.
export function createDecisionClient(env: Env, llm: LlmClient, onUsage?: LlmUsageSink): DecisionClient {
  const keys = keysOf(env)
  const route = routeDecision(env.DECISION_MODEL ?? '', keys)
  if (!route) return modelOf(env) ? new LlmDecisionClient(llm, modelOf(env)) : new FixtureDecisionClient()
  if (route.kind === 'google-decision') return new GeminiDecisionClient({ apiKey: keys.google ?? '', model: route.model })
  if (route.kind === 'openai-decision') return new OpenAiDecisionClient({ apiKey: keys.openai ?? '', model: route.model })
  if (route.kind === 'system-one') return new SystemOneDecisionClient({ apiKey: keys.openRouter ?? '', model: route.model })
  return new LlmDecisionClient(buildLlm(route.route, keys, onUsage), route.route.model)
}
