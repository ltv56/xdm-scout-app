import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fitSchema } from '../fit/fit.schema'
import { loadSandboxScript, scriptedDecision, scriptedHandler } from './sandbox-script'

const script = loadSandboxScript(join(process.cwd(), '../../fixtures'))
const handler = scriptedHandler(script)
const profile = { intro: 'We back AI builders in Southeast Asia.', programs: [{ name: 'Build Week', description: 'GPU credits.' }], signer: 'Linh' }

describe('sandbox script', () => {
  it('scores a scripted person with their own label and reasons', () => {
    const fit = fitSchema.parse(handler({ task: 'fit', system: '', user: JSON.stringify({ evidence: [{ id: 'bio:9001', text: 'bio', date: null }] }) }))
    expect(fit).toMatchObject({ fit: 'strong', role: 'founder', opening: { evidence_id: 'post:910001' } })
  })

  it('falls back to the plain canned answer for anyone not in the script', () => {
    const fit = fitSchema.parse(handler({ task: 'fit', system: '', user: JSON.stringify({ evidence: [{ id: 'bio:9006', text: 'Recipes', date: null }] }) }))
    expect(fit.fit).toBe('possible')
    expect(fit.unknowns).toContain('Canned answer: no LLM key configured')
  })

  it('writes the scripted hook and ask around the fund profile, with sources', () => {
    const out = handler({ task: 'draft', system: '', user: JSON.stringify({ opening: { evidence_id: 'post:920001', summary: null, text: 'Shipped v0.4' }, profile }) }) as { sentences: { text: string; source: unknown }[] }
    expect(out.sentences.map((s) => s.text)).toEqual([
      'Congrats on shipping v0.4 of your agent tracing tool.',
      'We back AI builders in Southeast Asia.',
      'Would Build Week be useful for the next release?',
      'No worries if not.',
    ])
    expect(out.sentences[0].source).toEqual({ type: 'evidence', evidence_id: 'post:920001' })
  })

  it('classifies a scripted reply with its class', () => {
    expect(handler({ task: 'reply', system: '', user: JSON.stringify({ input: 'Appreciate it, but not for us right now. Good luck with the program.' }) })).toEqual({ class: 'Not interested', probability: 0.95 })
    expect(handler({ task: 'reply', system: '', user: JSON.stringify({ input: 'something else' }) })).toEqual({ class: 'Unclear', probability: 0.5 })
  })

  it('gives each scripted draft its own check scores while its ask is unchanged', () => {
    const decide = scriptedDecision(script)
    const tomas = 'Congrats on shipping v0.4 of your agent tracing tool. Would Build Week be useful for the next release?'
    const lena = 'Your preprint on dexterous manipulation… Since you are clearly ready to spin it out, would Build Week be useful?'
    expect(decide({ code: 'one_person', input: tomas, sentence: null })).toBeLessThan(0.7)
    expect(decide({ code: 'no_loaded_question', input: lena, sentence: null })).toBe(0.55)
    expect(decide({ code: 'one_person', input: lena, sentence: null })).not.toBe(decide({ code: 'one_person', input: tomas, sentence: null }))
  })

  it('clears a scripted warning once the reviewer rewrites the ask', () => {
    const decide = scriptedDecision(script)
    const rewritten = 'Congrats on shipping v0.4 of your agent tracing tool. Is tracing for agent teams something you plan to raise for?'
    expect(decide({ code: 'one_person', input: rewritten, sentence: null })).toBeGreaterThanOrEqual(0.9)
  })

  it('knows the reply each scripted person sends', () => {
    expect(script.replyFor('9003')).toBe('Please stop messaging me.')
    expect(script.replyFor('9006')).toBeNull()
  })
})
