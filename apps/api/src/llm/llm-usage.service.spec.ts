import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDataSource } from '../test/db'
import { LlmUsage } from './llm-usage.entity'
import { LlmUsageService } from './llm-usage.service'
import { priceMicros } from './llm-pricing'

let ds: DataSource
let service: LlmUsageService

beforeEach(async () => {
  ds = await createTestDataSource()
  service = new LlmUsageService(ds)
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('priceMicros', () => {
  it('prices tokens from the table, longest model prefix first', () => {
    expect(priceMicros('gpt-5-nano', 1_000_000, 1_000_000)).toBe(450_000)
    expect(priceMicros('gpt-5-nano-2025-08-07', 1_000_000, 0)).toBe(50_000)
    expect(priceMicros('gpt-5-mini', 1_000_000, 0)).toBe(250_000)
  })

  it('rounds to whole micro-dollars', () => {
    expect(priceMicros('gpt-5-nano', 3, 0)).toBe(0)
    expect(priceMicros('gpt-5-nano', 1_000, 1_000)).toBe(450)
  })

  it('prices the gpt-6 models from the pricing page', () => {
    expect(priceMicros('gpt-6-luna', 1_000_000, 1_000_000)).toBe(600_000)
    expect(priceMicros('gpt-6.1-terra', 1_000_000, 1_000_000)).toBe(6_000_000)
    expect(priceMicros('gpt-6.1-sol', 1_000_000, 1_000_000)).toBe(12_000_000)
    expect(priceMicros('gpt-6-astra', 1_000_000, 1_000_000)).toBe(60_000_000)
  })

  it('does not mistake a gpt-6 model for a gpt-5 one', () => {
    expect(priceMicros('gpt-6-luna', 1_000_000, 0)).toBe(100_000)
  })

  it('answers null for a model with no price', () => {
    expect(priceMicros('some-new-model', 10, 10)).toBeNull()
  })
})

describe('LlmUsageService', () => {
  it('stores tokens and the price with the campaign and lane', async () => {
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 2_000, outputTokens: 500, meter: { campaignId: 3, lane: 'call' } })
    const [row] = await ds.getRepository(LlmUsage).find()
    expect([row.campaignId, row.lane, row.task, row.model, row.inputTokens, row.outputTokens, row.costMicros]).toEqual([3, 'call', 'draft', 'gpt-5-nano', 2_000, 500, 300])
  })

  it('flags the cost of a campaign lane as incomplete when a model had no price', async () => {
    const meter = { campaignId: 1, lane: 'search' as const }
    await service.record({ model: 'gpt-5-nano', task: 'fit', inputTokens: 1_000_000, outputTokens: 0, meter })
    expect((await service.costByLane(1)).unpriced).toEqual({ search: false, call: false })
    await service.record({ model: 'some-new-model', task: 'fit', inputTokens: 10, outputTokens: 5, meter })
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 10, outputTokens: 5, meter: { campaignId: 2, lane: 'call' } })
    expect(await service.costByLane(1)).toEqual({ search: 50_000, call: 0, unpriced: { search: true, call: false } })
    expect((await service.costByLane(2)).unpriced).toEqual({ search: false, call: false })
  })

  it('keeps the tokens of an unpriced model and records cost 0', async () => {
    await service.record({ model: 'some-new-model', task: 'fit', inputTokens: 10, outputTokens: 5, meter: { campaignId: 3, lane: 'search' } })
    const [row] = await ds.getRepository(LlmUsage).find()
    expect([row.inputTokens, row.costMicros]).toEqual([10, 0])
  })

  it('keeps a call that belongs to no campaign out of any campaign cost', async () => {
    await service.record({ model: 'gpt-5-nano', task: 'reply', inputTokens: 1_000_000, outputTokens: 0, meter: null })
    const [row] = await ds.getRepository(LlmUsage).find()
    expect([row.campaignId, row.lane]).toEqual([null, null])
    expect(await service.costByLane(1)).toEqual({ search: 0, call: 0, unpriced: { search: false, call: false } })
  })

  it('sums the cost of a campaign by lane', async () => {
    await service.record({ model: 'gpt-5-nano', task: 'fit', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'search' } })
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'call' } })
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 2_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'call' } })
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 2, lane: 'call' } })
    expect(await service.costByLane(1)).toEqual({ search: 50_000, call: 150_000, unpriced: { search: false, call: false } })
  })
})
