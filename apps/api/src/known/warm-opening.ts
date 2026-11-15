import { DataSource, In } from 'typeorm'
import { Prospect } from '../discovery/entities'
import { Evidence } from '../fit/entities'
import { KnownUser } from './known-user.entity'

const FUND_LIST_PREFIX = 'fund_list:'

// A scored person on a warm list who has no post to open with gets the list and its event as the opening.
// The date is when the list was imported: the app does not know when the event was.
export async function applyWarmOpening(ds: DataSource, xUserIds: string[], now: Date): Promise<void> {
  if (!xUserIds.length) return
  const warm = await ds.getRepository(KnownUser).findBy({ xUserId: In(xUserIds), kind: 'warm' })
  for (const k of warm) {
    const prospects = (await ds.getRepository(Prospect).findBy({ xUserId: k.xUserId })).filter((p) => p.scoredAt && (!p.openingType || p.openingType === 'none'))
    if (!prospects.length) continue
    const excerpt = k.event ? `${k.listName}: ${k.event}` : k.listName
    const id = `${FUND_LIST_PREFIX}${k.xUserId}`
    await ds.getRepository(Evidence).save({ id, xUserId: k.xUserId, kind: 'fund_list', url: '', excerpt, postedAt: k.createdAt, fetchedAt: now })
    await ds.getRepository(Prospect).update({ id: In(prospects.map((p) => p.id)) }, { openingType: 'fund_list', openingSummary: excerpt, openingEvidenceId: id, openingDate: k.createdAt })
  }
}
