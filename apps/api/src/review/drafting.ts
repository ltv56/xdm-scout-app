import { openingFreshness } from '../fit/fit.service'
import { RelationshipContext } from '../sending/entities'

export interface DraftCandidate {
  id: number
  fit: 'strong' | 'possible' | 'weak' | 'not_a_fit' | null
  relationship: RelationshipContext
  status: 'new' | 'shortlisted' | 'dismissed'
  openingEvidenceId: string | null
  openingDate: Date | null
}

const WARMTH: RelationshipContext[] = ['messaged_us', 'engaged', 'follower', 'adjacent', 'cold']

// cantReceive: prospect ids whose DMs X says they do not take; they are left out of the batch and can still be drafted one by one.
export function readyToDraft<T extends DraftCandidate>(prospects: T[], draftedIds: Set<number>, now: Date, cantReceive: Set<number> = new Set()): T[] {
  return prospects.filter(
    (p) =>
      !cantReceive.has(p.id) &&
      (p.fit === 'strong' || p.fit === 'possible') &&
      p.openingEvidenceId !== null &&
      !(p.openingDate && openingFreshness(p.openingDate, now) === 'expired') &&
      !draftedIds.has(p.id) &&
      p.status !== 'dismissed',
  )
}

export function pickForDrafting<T extends DraftCandidate>(ready: T[], limit: number): T[] {
  const time = (p: T) => p.openingDate?.getTime() ?? 0
  return [...ready]
    .sort((a, b) => Number(b.fit === 'strong') - Number(a.fit === 'strong') || WARMTH.indexOf(a.relationship) - WARMTH.indexOf(b.relationship) || time(b) - time(a))
    .slice(0, limit)
}
