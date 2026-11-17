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

  it('does not show an approved hand-off as sent', async () => {
    await attempt('201', 'manual_pending')
    expect((await service.list(1)).items.map((i) => i.label)).toEqual(['Send in X'])
  })

  it('gives a hand-off the link that opens X with the draft and the text to copy, and nothing for other sends', async () => {
    const pending = await attempt('201', 'manual_pending')
    await attempt('202', 'sent')
    const { items } = await service.list(1)
    const hand = items.find((i) => i.handle === 'u201')!
    expect(hand.draftId).toBe(pending.draftId)
    expect(hand.text).toBe('Hi 201')
    expect(hand.openInX).toBe('https://x.com/messages/compose?recipient_id=201&text=Hi%20201')
    const sent = items.find((i) => i.handle === 'u202')!
    expect([sent.text, sent.openInX]).toEqual([null, null])
  })

  it('still reports work in flight when it is older than the newest 100 rows', async () => {
    await attempt('300', 'queued')
    // In parallel batches: 100 rows one at a time took most of this file's run time.
    for (let b = 0; b < 4; b++) await Promise.all(Array.from({ length: 25 }, (_, i) => attempt(String(400 + b * 25 + i), 'sent')))
    const outbox = await service.list(1)
    expect(outbox.items).toHaveLength(100)
    expect(outbox.inFlight).toBe(true)
  }, 30_000)
})
