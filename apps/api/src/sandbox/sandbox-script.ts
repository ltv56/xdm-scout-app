import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DecisionAsk } from '../decisions/decision-client'
import { cannedHandler } from '../llm/fake-llm-client'
import type { LlmRequest } from '../llm/llm-client'

// Sandbox only (SANDBOX_SCRIPT=1): fixed model answers per fixture person, so a visitor sees a varied, believable run without a key.
type Person = {
  fit: Record<string, unknown> & { opening: { evidence_id: string | null } }
  hook: string
  ask: string
  checks?: Record<string, number>
  reply?: { text: string; class: string }
}

export type SandboxScript = {
  people: Record<string, Person>
  replyFor(xUserId: string): string | null
}

export function loadSandboxScript(dir = join(process.cwd(), '../../fixtures')): SandboxScript {
  const { people } = JSON.parse(readFileSync(join(dir, 'sandbox-script.json'), 'utf8')) as { people: Record<string, Person> }
  return { people, replyFor: (id) => people[id]?.reply?.text ?? null }
}

type DraftInput = { opening: { evidence_id: string }; profile: { intro: string; programs: { name: string }[] } }

const byBio = (script: SandboxScript, evidence: { id: string }[]) => evidence.map((e) => (e.id.startsWith('bio:') ? script.people[e.id.slice(4)] : undefined)).find(Boolean)
const byOpening = (script: SandboxScript, id: string) => Object.values(script.people).find((p) => p.fit.opening.evidence_id === id)

export function scriptedHandler(script: SandboxScript) {
  return (req: LlmRequest): unknown => {
    if (req.task === 'fit') {
      const person = byBio(script, (JSON.parse(req.user) as { evidence: { id: string }[] }).evidence)
      if (person) return person.fit
    }
    if (req.task === 'draft') {
      const input = JSON.parse(req.user) as DraftInput
      const person = byOpening(script, input.opening.evidence_id)
      if (person) {
        return {
          sentences: [
            { text: person.hook, source: { type: 'evidence', evidence_id: input.opening.evidence_id } },
            { text: input.profile.intro, source: { type: 'sender_profile', field: 'intro' } },
            { text: person.ask.replace('{program}', input.profile.programs[0]?.name ?? 'an intro'), source: { type: 'sender_profile', field: 'program' } },
            { text: 'No worries if not.', source: { type: 'opt_out' } },
          ],
        }
      }
    }
    if (req.task === 'reply') {
      const text = (JSON.parse(req.user) as { input: string }).input
      const reply = Object.values(script.people).find((p) => p.reply?.text === text)?.reply
      if (reply) return { class: reply.class, probability: 0.95 }
    }
    return cannedHandler(req)
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const askPattern = (ask: string) => new RegExp(ask.split('{program}').map(escape).join('.+?'))

// Each scripted draft keeps its own scores only while its scripted ask is still in the text; a rewrite scores as clean.
export function scriptedDecision(script: SandboxScript) {
  const people = Object.values(script.people).map((p) => ({ ask: askPattern(p.ask), checks: p.checks ?? {} }))
  return (ask: DecisionAsk): number => {
    const planted = people.find((p) => p.ask.test(ask.input))?.checks[ask.code]
    if (planted !== undefined) return planted
    return ask.code === 'own_account' ? 0.97 : 0.93
  }
}
