import { DecisionAdapter, HttpDecisionClient, HttpDecisionConfig, instructions, noulProbability } from './http-decision-client'

export type SystemOneConfig = HttpDecisionConfig

// System One on OpenRouter (TypeSafe Jev). The endpoint is alpha, so the caller pins the model.
const systemOne: DecisionAdapter = {
  name: 'System One',
  defaultModel: 'typesafe/jev-1.14',
  url: (baseUrl = 'https://openrouter.ai/api/v1') => `${baseUrl.replace(/\/$/, '')}/systemone`,
  headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  body: (model, ask) => ({ model, state: { input: ask.input }, questions: { [ask.code]: { type: 'noul', instructions: instructions(ask) } } }),
  probability: noulProbability,
}

export class SystemOneDecisionClient extends HttpDecisionClient {
  constructor(config: SystemOneConfig) {
    super(systemOne, config)
  }
}
