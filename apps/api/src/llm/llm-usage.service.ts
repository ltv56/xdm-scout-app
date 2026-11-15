import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { LlmUsageReport } from './llm-client'
import { priceLine, priceMicros } from './llm-pricing'
import { LlmUsage } from './llm-usage.entity'

const warned = new Set<string>()

@Injectable()
export class LlmUsageService {
  constructor(private readonly ds: DataSource) {}

  async record(u: LlmUsageReport): Promise<void> {
    if (!priceLine(u.model) && !warned.has(u.model)) {
      warned.add(u.model)
      console.warn(`No price for model ${u.model} in llm-pricing.ts: its cost is recorded as 0`)
    }
    await this.ds.getRepository(LlmUsage).save({
      campaignId: u.meter?.campaignId ?? null,
      lane: u.meter?.lane ?? null,
      task: u.task,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      costMicros: priceMicros(u.model, u.inputTokens, u.outputTokens) ?? 0,
    })
  }

  async costByLane(campaignId: number): Promise<{ search: number; call: number }> {
    const rows = await this.ds
      .getRepository(LlmUsage)
      .createQueryBuilder('u')
      .select('u.lane', 'lane')
      .addSelect('COALESCE(SUM(u.costMicros), 0)', 'total')
      .where('u.campaignId = :campaignId', { campaignId })
      .groupBy('u.lane')
      .getRawMany<{ lane: 'search' | 'call'; total: string }>()
    const out = { search: 0, call: 0 }
    for (const r of rows) out[r.lane] += Number(r.total)
    return out
  }
}
