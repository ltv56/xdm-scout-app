import { DataSource, In, IsNull } from 'typeorm'
import { JobsService } from '../jobs/jobs.service'
import { Prospect } from './entities'

// Everyone not scored yet (or the given people), skipping anyone already waiting for the worker.
export async function queueScores(ds: DataSource, jobs: JobsService, campaignId: number, ids?: number[], now = new Date()): Promise<number> {
  const pending = await ds.getRepository(Prospect).findBy(ids ? { campaignId, id: In(ids) } : { campaignId, scoredAt: IsNull() })
  let queued = 0
  for (const p of pending) {
    if (await jobs.hasOpen('score', 'prospectId', p.id)) continue
    await jobs.enqueue('score', { prospectId: p.id }, now)
    queued += 1
  }
  return queued
}
