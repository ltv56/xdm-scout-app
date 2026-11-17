import { openingFreshness } from '../fit/fit.service'

type Fit = 'strong' | 'possible' | 'weak' | 'not_a_fit' | null
type Side = 'for' | 'against' | 'unknown'
type Status = 'verified' | 'inferred' | 'unsure'
type ClaimLike = { side: Side; text: string; status: Status }

const STRENGTH: Record<Status, number> = { verified: 0, unsure: 1, inferred: 2 }

// The one reason shown beside a Fit label: for Strong and Possible the best reason for, for Weak and Not a fit the best
// reason against; a post-backed reason beats one that is only a guess. Falls back to the other side when one side is empty.
export function leadReason<T extends ClaimLike>(fit: Fit, claims: T[]): T | null {
  if (!fit) return null
  const best = (side: Side) => claims.filter((c) => c.side === side).sort((a, b) => STRENGTH[a.status] - STRENGTH[b.status])[0] ?? null
  const [first, second]: Side[] = fit === 'strong' || fit === 'possible' ? ['for', 'against'] : ['against', 'for']
  return best(first) ?? best(second)
}

export type NoOpening = { cause: 'posts_not_read' | 'no_recent_post' | 'expired'; date: Date | null }

// Why a scored person has nothing to write about. Null when unscored or the opening can be used.
export function noOpening(p: { fit: Fit; openingType: string | null; openingDate: Date | null }, postsRead: number, now: Date): NoOpening | null {
  if (!p.fit) return null
  if (p.openingType && p.openingType !== 'none' && p.openingDate) {
    return openingFreshness(p.openingDate, now) === 'expired' ? { cause: 'expired', date: p.openingDate } : null
  }
  return postsRead === 0 ? { cause: 'posts_not_read', date: null } : { cause: 'no_recent_post', date: null }
}
