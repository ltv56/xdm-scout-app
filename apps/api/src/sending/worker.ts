import { Injectable, Optional } from '@nestjs/common'
import { DiscoveryService } from '../discovery/discovery.service'
import { FitService } from '../fit/fit.service'
import { EvidenceRecheckService } from '../fit/evidence-recheck.service'
import { InboundLaneService } from '../inbound/inbound-lane.service'
import { RepliesService } from '../inbox/replies.service'
import { queueScores } from '../discovery/queue-scores'
import { JobsService } from '../jobs/jobs.service'
import { DraftService } from '../review/draft.service'
import { ReviewService } from '../review/review.service'
import { XRateLimitError } from '../x/x-client'
import { SendingService } from './sending.service'

// Jobs that only call the model and write their own rows; these run side by side.
export const MODEL_JOBS = ['score', 'draft']
const MODEL_LANES = 3
// A model job that fails (a 503, a MySQL deadlock between lanes) is tried again: 3 tries, the wait doubling from 5 s.
const MAX_TRIES = 3
const BACKOFF_MS = 5000

@Injectable()
export class Worker {
  constructor(
    private readonly jobs: JobsService,
    private readonly sending: SendingService,
    private readonly discovery: DiscoveryService,
    private readonly fit: FitService,
    private readonly drafts: DraftService,
    private readonly replies: RepliesService,
    private readonly inbound: InboundLaneService,
    private readonly evidence: EvidenceRecheckService,
    @Optional() private readonly review?: ReviewService,
  ) {}

  async tick(now = new Date(), types?: string[]): Promise<boolean> {
    const job = await this.jobs.claimNext(now, types)
    if (!job) return false
    try {
      if (job.type === 'send') await this.sending.processAttempt(job.payload.attemptId, now)
      else if (job.type === 'reconcile') await this.sending.reconcile(job.payload.attemptId, now)
      else if (job.type === 'discover') {
        await this.discovery.run(job.payload.campaignId, now)
        // Scoring is model calls only (the search already read the posts), so it starts without another click.
        await queueScores(this.jobs.dataSource, this.jobs, job.payload.campaignId, undefined, now)
      }
      else if (job.type === 'score') await this.fit.score(job.payload.prospectId, now)
      else if (job.type === 'verify_manual') await this.sending.verifyManual(job.payload.attemptId, now, job.payload.step, job.payload.fromMs)
      else if (job.type === 'draft') await this.draft(job.payload.prospectId, now)
      else if (job.type === 'read_replies') await this.replies.read(job.payload.contactId, now)
      else if (job.type === 'recheck_evidence') await this.evidence.recheckLive(now)
      else if (job.type === 'inbound_check') await this.inbound.attach(job.payload.campaignId)
      else throw new Error(`Unknown job type: ${job.type}`)
      await this.jobs.finish(job.id)
    } catch (err) {
      if (err instanceof XRateLimitError) await this.jobs.retry(job.id, err.retryAt)
      // A failed job rolled back its own transaction, so running a model job again is safe.
      else if (MODEL_JOBS.includes(job.type) && job.attempts < MAX_TRIES) await this.jobs.retry(job.id, new Date(now.getTime() + BACKOFF_MS * 2 ** (job.attempts - 1)))
      else await this.jobs.finish(job.id, err instanceof Error ? err.message : String(err))
    }
    return true
  }

  private async draft(prospectId: number, now: Date) {
    const id = await this.drafts.generate(prospectId, now)
    // The draft is written either way; Review asks again if this fails.
    await this.review?.warm(id).catch((err: unknown) => console.error('model checks failed for draft', id, err))
  }

  // One worker process runs at a time, so anything still `running` at start was cut off by a crash.
  async recover(now: Date) {
    await this.sending.recoverStale(now)
    await this.jobs.requeueRunning()
  }

  async run(pollMs = 2000) {
    await this.recover(new Date())
    // One lane takes every job in order; the others only take model jobs.
    await Promise.all([this.lane(pollMs), ...Array.from({ length: MODEL_LANES }, () => this.lane(pollMs, MODEL_JOBS))])
  }

  private async lane(pollMs: number, types?: string[]) {
    for (;;) {
      const worked = await this.tick(new Date(), types).catch((err: unknown) => {
        console.error('worker tick failed', err)
        return false
      })
      if (!worked) await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }
}
