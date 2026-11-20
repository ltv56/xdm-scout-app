import { openingFreshness } from '../fit/fit.service'
import { CriterionResult } from '../discovery/entities'
import { RelationshipContext } from '../sending/entities'

export interface DraftCandidate {
  id: number
  fit: 'strong' | 'possible' | 'weak' | 'not_a_fit' | null
  relationship: RelationshipContext
  status: 'new' | 'shortlisted' | 'dismissed'
  openingEvidenceId: string | null
  openingDate: Date | null
  criteria?: CriterionResult[] | null
}

// Fund criteria met push a person up, not met pushes them down; unknown is neutral.
export function criteriaRank(criteria: CriterionResult[] | null | undefined): number {
  return (criteria ?? []).reduce((n, c) => n + (c.status === 'met' ? -1 : c.status === 'not_met' ? 1 : 0), 0)
}

const WARMTH: RelationshipContext[] = ['messaged_us', 'engaged', 'follower', 'adjacent', 'cold']

// cantReceive: prospect ids whose DMs X says they do not take; they are left out of the batch and can still be drafted one by one.
// fromProfile: prospect ids with no opening post whose posts were read and whose bio is stored, so the draft opens with the bio.
export function readyToDraft<T extends DraftCandidate>(prospects: T[], draftedIds: Set<number>, now: Date, cantReceive: Set<number> = new Set(), fromProfile: Set<number> = new Set()): T[] {
  return prospects.filter(
    (p) =>
      !cantReceive.has(p.id) &&
      (p.fit === 'strong' || p.fit === 'possible') &&
      ((p.openingEvidenceId !== null && !(p.openingDate && openingFreshness(p.openingDate, now) === 'expired')) || fromProfile.has(p.id)) &&
      !draftedIds.has(p.id) &&
      p.status !== 'dismissed',
  )
}

export function pickForDrafting<T extends DraftCandidate>(ready: T[], limit: number): T[] {
  const time = (p: T) => p.openingDate?.getTime() ?? 0
  return [...ready]
    .sort((a, b) => Number(b.openingEvidenceId !== null) - Number(a.openingEvidenceId !== null) || Number(b.fit === 'strong') - Number(a.fit === 'strong') || WARMTH.indexOf(a.relationship) - WARMTH.indexOf(b.relationship) || criteriaRank(a.criteria) - criteriaRank(b.criteria) || time(b) - time(a))
    .slice(0, limit)
}
