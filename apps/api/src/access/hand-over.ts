import { DataSource } from 'typeorm'
import { ActivityLog } from '../activity/activity-log.entity'
import { SenderAccount } from '../sending/entities'
import { Setting } from '../setting.entity'

// For whoever runs the server: drops the owner, the saved keys and the X tokens, so a new INVITE_CODE can set it up again.
// Campaigns, people and the send ledger stay.
export async function handOver(ds: DataSource) {
  await ds.transaction(async (em) => {
    await em.delete(Setting, { key: 'access' })
    await em.delete(Setting, { key: 'keys' })
    await em.createQueryBuilder().update(SenderAccount).set({ accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null }).execute()
    await em.save(ActivityLog, { kind: 'handed_over', subject: 'owner', detail: 'Owner, saved keys and X tokens removed from the server' })
  })
}
