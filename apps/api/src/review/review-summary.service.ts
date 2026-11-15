import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { ReviewSummary } from './contract'
import { ReviewSignal } from './review-signal.entity'

// What reviewers did to the AI's drafts in one campaign: tells the operator whether to change the criteria or the draft frame.
@Injectable()
export class ReviewSummaryService {
  constructor(private readonly ds: DataSource) {}

  async get(campaignId: number): Promise<ReviewSummary> {
    const repo = this.ds.getRepository(ReviewSignal)
    const approvals = await repo.find({ where: { campaignId, action: 'approve' } })
    const skips = await repo
      .createQueryBuilder('s')
      .select('s.reason', 'reason')
      .addSelect('COUNT(*)', 'count')
      .where('s.campaignId = :campaignId', { campaignId })
      .andWhere("s.action IN ('skip', 'dismiss')")
      .groupBy('s.reason')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('s.reason', 'ASC')
      .getRawMany<{ reason: string | null; count: string }>()
    return {
      approved: approvals.length,
      edited: approvals.filter((a) => a.finalText !== null && a.finalText !== a.originalText).length,
      skipped: skips.map((s) => ({ reason: s.reason ?? 'other', count: Number(s.count) })),
    }
  }
}
