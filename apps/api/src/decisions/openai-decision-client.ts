import { z } from 'zod'
import { DecisionAdapter, HttpDecisionClient, HttpDecisionConfig, instructions } from './http-decision-client'

export type OpenAiDecisionConfig = Omit<HttpDecisionConfig, 'baseUrl'>

const answers = z.object({ answers: z.array(z.object({ type: z.string(), probability: z.number().min(0).max(1).optional() })) })

// OpenAI Decisions API: the questions share one input, so each ask (with its own input) is one call.
const openAiDecisions: DecisionAdapter = {
  name: 'OpenAI Decisions',
  defaultModel: 'gpt-6-luna',
  url: () => 'https://api.openai.com/v1/decisions',
  headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  body: (model, ask) => ({ model, input: ask.input, questions: [{ type: 'predicate', name: ask.code, instructions: instructions(ask) }] }),
  probability: (json) => {
    const parsed = answers.safeParse(json)
    const answer = parsed.success ? parsed.data.answers[0] : undefined
    return answer?.type === 'predicate' ? answer.probability : undefined
  },
}

export class OpenAiDecisionClient extends HttpDecisionClient {
  constructor(config: OpenAiDecisionConfig) {
    super(openAiDecisions, config)
  }
}
