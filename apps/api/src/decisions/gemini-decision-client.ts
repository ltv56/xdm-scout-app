import { DecisionAdapter, HttpDecisionClient, HttpDecisionConfig, instructions, noulProbability } from './http-decision-client'

export type GeminiDecisionConfig = Omit<HttpDecisionConfig, 'baseUrl'>

// Google Decisions API: not OpenAI-compatible and not on OpenRouter. The text goes in `input`.
const googleDecisions: DecisionAdapter = {
  name: 'Gemini Decision',
  defaultModel: 'gemini-decision-1',
  url: () => 'https://generativelanguage.googleapis.com/v1beta/decisions',
  headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
  body: (model, ask) => ({ model, input: ask.input, questions: { [ask.code]: { type: 'noul', instructions: instructions(ask) } } }),
  probability: noulProbability,
}

export class GeminiDecisionClient extends HttpDecisionClient {
  constructor(config: GeminiDecisionConfig) {
    super(googleDecisions, config)
  }
}
