import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { Job } from './job.entity'

@Injectable()
export class JobsService {
  constructor(private readonly ds: DataSource) {}

  get dataSource() {
    return this.ds
  }

  async enqueue(type: string, payload: Job['payload'], runAt: Date, em: EntityManager = this.ds.manager) {
    await em.save(Job, { type, payload, runAt })
  }

  claimNext(now: Date, types?: string[]): Promise<Job | null> {
    return this.ds.transaction(async (em) => {
      const q = em
        .createQueryBuilder(Job, 'j')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where("j.status = 'pending' AND j.runAt <= :now", { now })
      if (types) q.andWhere('j.type IN (:...types)', { types })
      const job = await q
        .orderBy('j.runAt')
        .addOrderBy('j.id')
        .limit(1)
        .getOne()
      if (!job) return null
      job.attempts += 1
      await em.update(Job, job.id, { status: 'running', attempts: job.attempts })
      return job
    })
  }

  hasOpen(type: string, key: string, value: number) {
    return this.ds
      .getRepository(Job)
      .createQueryBuilder('j')
      .where("j.type = :type AND j.status IN ('pending', 'running')", { type })
      .andWhere(`JSON_EXTRACT(j.payload, :path) = :value`, { path: `$.${key}`, value })
      .getExists()
  }

  // A job of this type and payload key that failed at or after since.
  failedSince(type: string, key: string, value: number, since: Date) {
    return this.ds
      .getRepository(Job)
      .createQueryBuilder('j')
      .where("j.type = :type AND j.status = 'failed' AND j.runAt >= :since", { type, since })
      .andWhere(`JSON_EXTRACT(j.payload, :path) = :value`, { path: `$.${key}`, value })
      .getExists()
  }

  // Moves a pending job with this payload key to runAt; false when there is none.
  async moveOpen(type: string, key: string, value: number, runAt: Date, em: EntityManager = this.ds.manager) {
    const res = await em
      .createQueryBuilder()
      .update(Job)
      .set({ runAt })
      .where("type = :type AND status = 'pending'", { type })
      .andWhere(`JSON_EXTRACT(payload, :path) = :value`, { path: `$.${key}`, value })
      .execute()
    return !!res.affected
  }

  async retry(id: number, runAt: Date) {
    await this.ds.getRepository(Job).update(id, { status: 'pending', runAt })
  }

  async requeueRunning() {
    await this.ds.getRepository(Job).update({ status: 'running' }, { status: 'pending' })
  }

  async finish(id: number, error?: string) {
    await this.ds.getRepository(Job).update(id, error ? { status: 'failed', error } : { status: 'done' })
  }
}
