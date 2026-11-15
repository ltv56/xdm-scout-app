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

  it('keeps the tokens of an unpriced model and records cost 0', async () => {
    await service.record({ model: 'some-new-model', task: 'fit', inputTokens: 10, outputTokens: 5, meter: { campaignId: 3, lane: 'search' } })
    const [row] = await ds.getRepository(LlmUsage).find()
    expect([row.inputTokens, row.costMicros]).toEqual([10, 0])
  })

  it('keeps a call that belongs to no campaign out of any campaign cost', async () => {
    await service.record({ model: 'gpt-5-nano', task: 'reply', inputTokens: 1_000_000, outputTokens: 0, meter: null })
    const [row] = await ds.getRepository(LlmUsage).find()
    expect([row.campaignId, row.lane]).toEqual([null, null])
    expect(await service.costByLane(1)).toEqual({ search: 0, call: 0 })
  })

  it('sums the cost of a campaign by lane', async () => {
    await service.record({ model: 'gpt-5-nano', task: 'fit', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'search' } })
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'call' } })
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 2_000_000, outputTokens: 0, meter: { campaignId: 1, lane: 'call' } })
    await service.record({ model: 'gpt-5-nano', task: 'draft', inputTokens: 1_000_000, outputTokens: 0, meter: { campaignId: 2, lane: 'call' } })
    expect(await service.costByLane(1)).toEqual({ search: 50_000, call: 150_000 })
  })
})
