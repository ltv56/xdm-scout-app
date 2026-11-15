import type { RelationshipContext, XUser } from '../sending/entities'

export type LandsIn = 'inbox' | 'requests' | 'cant_receive'

// Spec s5: a follower or an existing conversation is judged first and wins over receives_your_dm.
// null = the profile was never read or X never reported the field, so there is nothing to say.
export function landsIn(relationship: RelationshipContext, user: Pick<XUser, 'receivesYourDm' | 'fetchedAt'> | undefined): LandsIn | null {
  if (relationship === 'messaged_us' || relationship === 'follower') return 'inbox'
  if (!user?.fetchedAt) return null
  if (user.receivesYourDm === null || user.receivesYourDm === undefined) return null
  return user.receivesYourDm ? 'requests' : 'cant_receive'
}

export const LANDS_IN_RANK: Record<LandsIn | 'unknown', number> = { inbox: 0, requests: 1, cant_receive: 2, unknown: 3 }
