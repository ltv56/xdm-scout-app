import { Inject, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Prospect } from '../discovery/entities'
import { Job } from '../jobs/job.entity'
import { JobsService } from '../jobs/jobs.service'
import { StoredSentence } from '../review/checks'
import { Draft } from '../sending/entities'
import { X_CLIENT, XClient } from '../x/x-client'
import { citedPostIds, recheckEvidence } from './evidence-recheck'

const DAY_MS = 24 * 60 * 60_000

// Posts that live drafts quote can disappear from X; this finds out so Needs attention can show it.
@Injectable()
export class EvidenceRecheckService {
  constructor(
    private readonly ds: DataSource,
    @Inject(X_CLIENT) private readonly x: XClient,
    private readonly jobs: JobsService,
  ) {}

  async recheckLive(now: Date): Promise<void> {
    const drafts = await this.ds
      .createQueryBuilder(Draft, 'd')
      .innerJoin(Prospect, 'p', 'p.id = d.prospectId')
      .where("d.status IN ('pending', 'approved') AND d.sentences IS NOT NULL")
      .select(['d.sentences AS sentences', 'p.campaignId AS campaignId'])
      .getRawMany<{ sentences: StoredSentence[] | string; campaignId: number }>()
    const byCampaign = new Map<number, Set<string>>()
    for (const d of drafts) {
      const sentences = typeof d.sentences === 'string' ? (JSON.parse(d.sentences) as StoredSentence[]) : d.sentences
      const campaignId = Number(d.campaignId)
      byCampaign.set(campaignId, new Set([...(byCampaign.get(campaignId) ?? []), ...citedPostIds(sentences)]))
    }
    for (const [campaignId, ids] of byCampaign) await recheckEvidence(this.ds, this.x, [...ids], now, campaignId)
  }

  // One recheck a day, none while the last one is still open.
  async scheduleDaily(now: Date): Promise<void> {
    if (await this.jobs.hasOpen('recheck_evidence', 'all', 1)) return
    const last = await this.ds
      .getRepository(Job)
      .createQueryBuilder('j')
      .select('MAX(j.runAt)', 'at')
      .where("j.type = 'recheck_evidence'")
      .getRawOne<{ at: Date | null }>()
    if (last?.at && now.getTime() - new Date(last.at).getTime() < DAY_MS) return
    await this.jobs.enqueue('recheck_evidence', { all: 1 }, now)
  }
}
