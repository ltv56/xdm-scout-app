import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ApiUsage, Campaign, Prospect } from '../discovery/entities'
import { Reply } from '../inbox/reply.entity'
import { AttemptStatus, Draft, SendAttempt } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { seedDraft, sha } from '../test/seed'
import { FunnelService } from './funnel.service'

let ds: DataSource
let service: FunnelService

async function person(xUserId: string, source: 'search' | 'call', opts: { status?: AttemptStatus; replyClass?: Reply['replyClass'] } = {}) {
  if (!(await ds.getRepository(Campaign).findOneBy({ id: 1 }))) await ds.getRepository(Campaign).save({ id: 1, name: 'c', keywords: [], handles: [] })
  const prospect = await ds.getRepository(Prospect).save({ campaignId: 1, xUserId, source })
  const draft = await seedDraft(ds, xUserId, `Hi ${xUserId}`)
  await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id })
  if (!opts.status) return
  const attempt = await ds.getRepository(SendAttempt).save({ contactId: draft.contactId, draftId: draft.id, status: opts.status, contentHash: sha(draft.content) })
  if (opts.replyClass) await ds.getRepository(Reply).save({ contactId: draft.contactId, attemptId: attempt.id, xEventId: `e-${xUserId}`, text: 'hey', source: 'api', at: new Date(), replyClass: opts.replyClass, classBy: 'llm' })
}

const usage = (kind: ApiUsage['kind'], costMicros: number) => ds.getRepository(ApiUsage).save({ campaignId: 1, kind, count: 1, costMicros })

beforeEach(async () => {
  ds = await createTestDataSource()
  service = new FunnelService(ds)
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('FunnelService', () => {
  it('counts each step per lane', async () => {
    await person('201', 'search')
    await person('202', 'search', { status: 'sent', replyClass: 'Interested' })
    await person('203', 'search', { status: 'sent', replyClass: 'Opt-out' })
    await person('204', 'search', { status: 'failed' })
    await person('205', 'call', { status: 'sent', replyClass: 'Question' })
    const { lanes } = await service.get(1)
    expect(lanes.map((l) => [l.lane, l.found, l.drafted, l.sent, l.replied, l.conversations])).toEqual([
      ['search', 4, 4, 2, 2, 1],
      ['call', 1, 1, 1, 1, 1],
    ])
  })

  it('splits X cost by lane and divides it by conversations', async () => {
    await person('202', 'search', { status: 'sent', replyClass: 'Interested' })
    await person('205', 'call', { status: 'sent', replyClass: 'Question' })
    await usage('profile', 60_000)
    await usage('post', 40_000)
    await usage('dm_event', 20_000)
    const { lanes, totalMicros } = await service.get(1)
    expect(lanes.map((l) => [l.costMicros, l.costPerConversationMicros])).toEqual([
      [100_000, 100_000],
      [20_000, 20_000],
    ])
    expect(totalMicros).toBe(120_000)
  })

  it('has no cost per conversation before the first conversation', async () => {
    await person('201', 'search')
    await usage('profile', 60_000)
    expect((await service.get(1)).lanes[0].costPerConversationMicros).toBeNull()
  })

  it('shows the call lane only when it has people', async () => {
    await person('201', 'search')
    expect((await service.get(1)).lanes.map((l) => l.lane)).toEqual(['search'])
  })
})
