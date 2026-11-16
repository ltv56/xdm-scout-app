import { describe, expect, it } from 'vitest'
import { SwitchingDecisionClient, SwitchingLlmClient } from './switching'

const req = { task: 'fit' as const, system: 's', user: '{}' }

describe('SwitchingLlmClient', () => {
  it('in live mode without a key fails every call with where to add it, and never answers with canned text', async () => {
    const llm = new SwitchingLlmClient(() => ({ X_MODE: 'live', LLM_MODEL: '' }))
    expect(llm.model).toBeUndefined()
    await expect(llm.completeJson(req)).rejects.toThrow('Add the OpenAI key on Settings > Keys')
  })

  it('picks up a key saved while the app runs, without a restart', () => {
    const env: Record<string, string> = { X_MODE: 'live', LLM_MODEL: '' }
    const llm = new SwitchingLlmClient(() => env)
    expect(llm.model).toBeUndefined()
    env.OPENAI_API_KEY = 'sk-test'
    expect(llm.model).toBe('gpt-6-luna')
  })

  it('keeps the canned answers in the sandbox, where no model is set', async () => {
    const llm = new SwitchingLlmClient(() => ({ X_MODE: 'fake', LLM_MODEL: '' }))
    expect(await llm.completeJson({ task: 'verify', system: '', user: '{}' })).toEqual({ supported: true })
  })
})

describe('SwitchingDecisionClient', () => {
  it('in live mode without a key fails the checks instead of answering from fixtures', async () => {
    const env = () => ({ X_MODE: 'live', LLM_MODEL: '', DECISION_MODEL: '' })
    const decisions = new SwitchingDecisionClient(env, new SwitchingLlmClient(env))
    await expect(decisions.decide([{ code: 'invitation', input: 'i' } as never])).rejects.toThrow('Add the OpenAI key on Settings > Keys')
  })
})
