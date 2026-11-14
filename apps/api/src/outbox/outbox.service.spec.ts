import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Campaign, Prospect } from '../discovery/entities'
import { AttemptStatus, Draft, SendAttempt } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { seedDraft, sha } from '../test/seed'
import { OutboxService } from './outbox.service'

let ds: DataSource
let service: OutboxService

async function attempt(xUserId: string, status: AttemptStatus, campaignId = 1, error: string | null = null) {
  if (!(await ds.getRepository(Campaign).findOneBy({ id: campaignId }))) await ds.getRepository(Campaign).save({ id: campaignId, name: `c${campaignId}`, keywords: [], handles: [] })
  const draft = await seedDraft(ds, xUserId, `Hi ${xUserId}`)
  const prospect = await ds.getRepository(Prospect).save({ campaignId, xUserId })
  await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id })
  return ds.getRepository(SendAttempt).save({ contactId: draft.contactId, draftId: draft.id, route: 'api', status, contentHash: sha(draft.content), error })
}

beforeEach(async () => {
  ds = await createTestDataSource()
  service = new OutboxService(ds)
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('OutboxService', () => {
  it('lists the campaign sends newest first with plain labels', async () => {
    await attempt('201', 'sent')
    await attempt('202', 'failed', 1, 'X said no')
    await attempt('203', 'sent', 2)
    const { items } = await service.list(1)
    expect(items.map((i) => [i.handle, i.label, i.error])).toEqual([
      ['u202', 'Failed', 'X said no'],
      ['u201', 'Sent', null],
    ])
  })

  it('says whether something is still on its way', async () => {
    await attempt('201', 'sent')
    expect((await service.list(1)).inFlight).toBe(false)
    await attempt('202', 'queued')
    expect((await service.list(1)).inFlight).toBe(true)
  })

  it('leaves out approved drafts that were never sent', async () => {
    await attempt('201', 'approved')
    expect((await service.list(1)).items).toEqual([])
  })
})
