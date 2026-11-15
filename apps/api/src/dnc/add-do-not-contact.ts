import { EntityManager } from 'typeorm'
import { ActivityLog } from '../activity/activity-log.entity'
import { DoNotContact } from '../sending/entities'

// Adding is idempotent; only a real addition is logged.
export async function addDoNotContact(em: EntityManager, entry: { xUserId: string; reason: string; source: string }): Promise<void> {
  const res = await em.createQueryBuilder().insert().into(DoNotContact).values(entry).orIgnore().execute()
  if (res.raw.affectedRows) await em.save(ActivityLog, { kind: 'dnc_added', subject: entry.xUserId, detail: entry.reason.slice(0, 500) })
}
