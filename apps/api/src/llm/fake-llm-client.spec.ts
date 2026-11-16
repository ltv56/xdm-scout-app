import { describe, expect, it } from 'vitest'
import { cannedHandler } from './fake-llm-client'

describe('canned draft (sandbox, no model key)', () => {
  it('asks about the first program in a plain question before the opt-out', () => {
    const user = JSON.stringify({
      opening: { evidence_id: 'post:1', summary: 'Shipped v2 of an eval harness', text: '' },
      profile: { intro: "I'm Vinh at GenAI Fund.", programs: [{ name: 'Agentic AI Build Week', description: '' }], signer: 'Vinh' },
    })
    const { sentences } = cannedHandler({ task: 'draft', system: '', user }) as { sentences: { text: string }[] }
    expect(sentences.map((s) => s.text)).toEqual(['Saw your post: Shipped v2 of an eval harness.', "I'm Vinh at GenAI Fund.", 'Would Agentic AI Build Week be useful to you?', 'No worries if not.'])
  })
})
