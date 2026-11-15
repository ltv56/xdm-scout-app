import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ApiUsage, Campaign, Prospect } from '../discovery/entities'
import { Reply } from '../inbox/reply.entity'
import { AttemptStatus, Draft, SendAttempt } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { seedDraft, sha } from '../test/seed'
import { LlmUsageService } from '../llm/llm-usage.service'
import { FunnelService } from './funnel.service'

let ds: DataSource
let service: FunnelService

async function person(xUserId: string, source: 'search' | 'call', opts: { fit?: Prospect['fit']; status?: AttemptStatus; replyClass?: Reply['replyClass'] } = {}) {
  if (!(await ds.getRepository(Campaign).findOneBy({ id: 1 }))) await ds.getRepository(Campaign).save({ id: 1, name: 'c', keywords: [], handles: [] })
  const prospect = await ds.getRepository(Prospect).save({ campaignId: 1, xUserId, source, fit: opts.fit ?? 'strong' })
  const draft = await seedDraft(ds, xUserId, `Hi ${xUserId}`)
  await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id, ...(opts.status ? { status: 'approved' as const } : {}) })
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
  it('counts the six steps per lane', async () => {
    await person('201', 'search', { fit: 'weak' })
    await person('202', 'search')
    await person('203', 'search', { status: 'sent', replyClass: 'Interested' })
    await person('204', 'search', { fit: 'possible', status: 'sent', replyClass: 'Opt-out' })
    await person('206', 'search', { status: 'failed' })
    await person('205', 'call', { status: 'sent', replyClass: 'Question' })
    const { lanes } = await service.get(1)
    expect(lanes.map((l) => [l.lane, l.found, l.goodFit, l.approved, l.sent, l.replied, l.conversations])).toEqual([
      ['search', 5, 4, 3, 2, 2, 1],
      ['call', 1, 1, 1, 1, 1, 1],
    ])
  })

  it('splits X cost by lane and divides it by conversations', async () => {
    await person('202', 'search', { status: 'sent', replyClass: 'Interested' })
    await person('205', 'call', { status: 'sent', replyClass: 'Question' })
    await usage('profile', 60_000)
    await usage('post', 40_000)
    await usage('dm_event', 20_000)
    const { lanes, totalMicros } = await service.get(1)
    expect(lanes.map((l) => [l.costMicros, l.llmCostMicros, l.costPerConversationMicros])).toEqual([
      [100_000, 0, 100_000],
      [20_000, 0, 20_000],
    ])
    expect(totalMicros).toBe(120_000)
  })

  it('adds the model cost of each lane, and counts it in the cost per conversation', async () => {
    await person('202', 'search', { status: 'sent', replyClass: 'Interested' })
    await person('205', 'call', { status: 'sent', replyClass: 'Question' })
    await usage('profile', 60_000)
    const llm = new LlmUsageService(ds)
    await llm.record({ model: 'gpt-5-nano', task: 'fit', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'search' } })
    await llm.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 2_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'call' } })
    await llm.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 2, lane: 'call' } })
    const { lanes, totalMicros, llmMicros } = await service.get(1)
    expect(lanes.map((l) => [l.costMicros, l.llmCostMicros, l.costPerConversationMicros])).toEqual([
      [60_000, 50_000, 110_000],
      [0, 100_000, 100_000],
    ])
    expect([llmMicros, totalMicros]).toEqual([150_000, 210_000])
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
