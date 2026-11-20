import { describe, expect, it } from 'vitest'
import { pickForDrafting, readyToDraft, DraftCandidate } from './drafting'

const now = new Date('2026-11-13T10:00:00Z')
const DAY = 86_400_000

function p(id: number, over: Partial<DraftCandidate> = {}): DraftCandidate {
  return {
    id,
    fit: 'strong',
    relationship: 'cold',
    status: 'new',
    openingEvidenceId: `post:${id}`,
    openingDate: new Date(now.getTime() - 3 * DAY),
    ...over,
  }
}

describe('readyToDraft', () => {
  it('keeps Strong and Possible people with a fresh opening, no draft, not dismissed', () => {
    const people = [
      p(1),
      p(2, { fit: 'possible' }),
      p(3, { fit: 'weak' }),
      p(4, { fit: 'not_a_fit' }),
      p(5, { fit: null }),
      p(6, { openingEvidenceId: null }),
      p(7, { openingDate: new Date(now.getTime() - 100 * DAY) }),
      p(8),
      p(9, { status: 'dismissed' }),
      p(10, { status: 'shortlisted' }),
    ]
    expect(readyToDraft(people, new Set([8]), now).map((x) => x.id)).toEqual([1, 2, 10])
  })

  it('leaves out the people who cannot receive a DM, and keeps the rest', () => {
    expect(readyToDraft([p(1), p(2), p(3)], new Set(), now, new Set([2])).map((x) => x.id)).toEqual([1, 3])
  })

  it('keeps a person with no opening when they can be drafted from their profile', () => {
    expect(readyToDraft([p(1, { openingEvidenceId: null }), p(2, { openingEvidenceId: null })], new Set(), now, new Set(), new Set([2])).map((x) => x.id)).toEqual([2])
  })

  it('treats an opening without a date as not expired', () => {
    expect(readyToDraft([p(1, { openingDate: null })], new Set(), now)).toHaveLength(1)
  })
})

describe('pickForDrafting', () => {
  it('puts everyone with a post to open with ahead of profile-only drafts', () => {
    const ready = [p(1, { openingEvidenceId: null, openingDate: null }), p(2, { fit: 'possible' })]
    expect(pickForDrafting(ready, 10).map((x) => x.id)).toEqual([2, 1])
  })

  it('puts Strong first, then the warmer relationship, then the newer opening', () => {
    const ready = [
      p(1, { fit: 'possible', relationship: 'messaged_us' }),
      p(2, { relationship: 'cold', openingDate: new Date(now.getTime() - 5 * DAY) }),
      p(3, { relationship: 'cold', openingDate: new Date(now.getTime() - 1 * DAY) }),
      p(4, { relationship: 'follower' }),
      p(5, { relationship: 'messaged_us' }),
    ]
    expect(pickForDrafting(ready, 10).map((x) => x.id)).toEqual([5, 4, 3, 2, 1])
  })

  it('within the same Fit, puts people who meet the fund criteria ahead of unknown, and unknown ahead of not met', () => {
    const c = (...s: ('met' | 'not_met' | 'unknown')[]) => s.map((status) => ({ text: 'x', status, evidenceIds: [] }))
    const ready = [
      p(1, { criteria: c('not_met', 'unknown') }),
      p(2, { criteria: c('unknown', 'unknown') }),
      p(3, { criteria: c('met', 'unknown') }),
      p(4, { fit: 'possible', criteria: c('met', 'met') }),
      p(5, { criteria: null }),
    ]
    expect(pickForDrafting(ready, 10).map((x) => x.id)).toEqual([3, 2, 5, 1, 4])
  })

  it('stops at the limit and leaves the input alone', () => {
    const ready = [p(1), p(2), p(3)]
    expect(pickForDrafting(ready, 2)).toHaveLength(2)
    expect(ready.map((x) => x.id)).toEqual([1, 2, 3])
  })
})
