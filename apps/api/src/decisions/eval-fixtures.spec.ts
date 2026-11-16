import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(__dirname, '../../../../fixtures/eval')
const load = <T>(name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as T

type Draft = { id: string; text: string; planted: string | null; labels: Record<string, boolean | null>; reviewed: boolean; batch?: number }
type Dm = { id: string; group: string; text: string; labels: { invitation: boolean | null; opt_out: boolean; reply_class: string | null }; reviewed: boolean; batch?: number }
type Profile = { id: string; handle: string; labels: { own_account: boolean; fits_segment: boolean | null }; reviewed: boolean; batch?: number }

describe('eval fixtures', () => {
  it('keeps the sizes the spec asks for', () => {
    expect(load<Profile[]>('profiles')).toHaveLength(60)
    expect(load<Dm[]>('dms')).toHaveLength(300)
    expect(load<Draft[]>('drafts')).toHaveLength(320)
  })

  it('has no repeated DM text and no repeated profile handle', () => {
    expect(new Set(load<Dm[]>('dms').map((d) => d.text)).size).toBe(300)
    expect(new Set(load<Profile[]>('profiles').map((p) => p.handle)).size).toBe(60)
  })

  it('has every label answered and every item reviewed', () => {
    for (const name of ['profiles', 'dms', 'drafts']) {
      const items = load<{ reviewed: boolean; labels: Record<string, unknown> }[]>(name)
      expect(items.every((i) => i.reviewed)).toBe(true)
      expect(items.every((i) => Object.values(i.labels).every((v) => v !== null))).toBe(true)
    }
  })
})
