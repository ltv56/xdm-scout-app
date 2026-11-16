import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DiscoveryService } from '../discovery/discovery.service'
import { Campaign, Prospect } from '../discovery/entities'
import { DraftService } from '../review/draft.service'
import { ReviewService } from '../review/review.service'
import { EvidenceRecheckService } from '../fit/evidence-recheck.service'
import { FitService } from '../fit/fit.service'
import { InboundLaneService } from '../inbound/inbound-lane.service'
import { RepliesService } from '../inbox/replies.service'
import { Job } from '../jobs/job.entity'
import { cannedHandler, FakeLlmClient } from '../llm/fake-llm-client'
import { JobsService } from '../jobs/jobs.service'
import { createTestDataSource } from '../test/db'
import { seedDraft, sha } from '../test/seed'
import { FakeXClient } from '../x/fake-x-client'
import { XRateLimitError } from '../x/x-client'
import { Evidence } from '../fit/entities'
import { Contact, DoNotContact, Draft, SendAttempt, SenderAccount } from './entities'
import { SendingService } from './sending.service'
import { MODEL_JOBS, Worker } from './worker'

let ds: DataSource
let x: FakeXClient
let service: SendingService
let worker: Worker

const MIN = 60_000
// An hour back, on a whole second: approve() stamps rows with the real clock, and test 6c needs a second boundary.
const t0 = new Date(Math.floor(Date.now() / 1000) * 1000 - 60 * MIN)
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms)

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  const jobs = new JobsService(ds)
  service = new SendingService(ds, x, jobs)
  worker = new Worker(jobs, service, new DiscoveryService(ds, x), new FitService(ds, new FakeLlmClient(cannedHandler)), new DraftService(ds, new FakeLlmClient(cannedHandler), jobs), new RepliesService(ds, x, jobs, new FakeLlmClient(cannedHandler)), new InboundLaneService(ds, x, jobs), new EvidenceRecheckService(ds, x, jobs))
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

// The API path only exists for people who messaged first, so the default conversation holds their DM.
async function approve(content = 'Hi there') {
  x.priorMessage('200', 'Hi, can we talk about your fund?', new Date(Date.now() - 86_400_000))
  const draft = await seedDraft(ds, '200', content)
  await service.approve(draft.id, sha(content))
  const { attemptId } = await service.send(draft.id, sha(content))
  return { draft, attemptId }
}

const attemptOf = (id: number) => ds.getRepository(SendAttempt).findOneByOrFail({ id })
const contactOf = (id: number) => ds.getRepository(Contact).findOneByOrFail({ id })

describe('worker', () => {
  it('approve enqueues a job and a tick sends the DM once', async () => {
    const { attemptId } = await approve()
    expect(await worker.tick(new Date())).toBe(true)
    expect((await attemptOf(attemptId)).status).toBe('sent')
    expect(x.sent).toHaveLength(1)
    expect(await worker.tick(new Date())).toBe(false)
  })

  it('two workers racing on one job send one DM', async () => {
    await approve()
    const other = new Worker(new JobsService(ds), service, new DiscoveryService(ds, x), new FitService(ds, new FakeLlmClient(cannedHandler)), new DraftService(ds, new FakeLlmClient(cannedHandler), new JobsService(ds)), new RepliesService(ds, x, new JobsService(ds), new FakeLlmClient(cannedHandler)), new InboundLaneService(ds, x, new JobsService(ds)), new EvidenceRecheckService(ds, x, new JobsService(ds)))
    await Promise.all([worker.tick(new Date()), other.tick(new Date())])
    expect(x.sent).toHaveLength(1)
  })

  it('runs a job again when a crashed worker left it running', async () => {
    const campaign = await ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics'], handles: ['alice'] })
    const job = await ds.getRepository(Job).save({ type: 'discover', payload: { campaignId: campaign.id }, runAt: t0, status: 'running' })
    await worker.recover(t0)
    expect((await ds.getRepository(Job).findOneByOrFail({ id: job.id })).status).toBe('pending')
  })

  it('fails a job of an unknown type instead of marking it done', async () => {
    const job = await ds.getRepository(Job).save({ type: 'nope', payload: {}, runAt: t0 })
    await worker.tick(t0)
    const after = await ds.getRepository(Job).findOneByOrFail({ id: job.id })
    expect(after.status).toBe('failed')
    expect(after.error).toContain('Unknown job type')
  })

  it('retries a rate-limited discovery job at the reset time', async () => {
    x.addProfile({ id: '1', handle: 'alice', bio: 'robotics' })
    const reset = plus(t0, 15 * MIN)
    x.readError = new XRateLimitError(reset)
    const campaign = await ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics'], handles: ['alice'] })
    await ds.getRepository(Job).save({ type: 'discover', payload: { campaignId: campaign.id }, runAt: t0 })

    await worker.tick(t0)
    const retried = await ds.getRepository(Job).findOneByOrFail({ type: 'discover' })
    expect(retried.status).toBe('pending')
    expect(retried.runAt).toEqual(reset)

    expect(await worker.tick(plus(t0, MIN))).toBe(false)
    await worker.tick(reset)
    expect((await ds.getRepository(Job).findOneByOrFail({ type: 'discover' })).status).toBe('done')
    expect(await ds.getRepository(Prospect).count()).toBe(1)
  })

  it('marks finished jobs done', async () => {
    await approve()
    await worker.tick(new Date())
    expect(await ds.getRepository(Job).countBy({ status: 'done' })).toBe(1)
  })
})

describe('send outcomes', () => {
  it('test 4: timeout but delivered -> unknown, reconcile finds it, no resend', async () => {
    const { attemptId } = await approve()
    x.nextSend = 'timeout-delivered'
    await worker.tick(new Date())
    expect((await attemptOf(attemptId)).status).toBe('unknown')

    await worker.tick(new Date(Date.now() + MIN))
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('sent')
    expect(attempt.xEventId).toBeTruthy()
    expect(x.sendCalls).toBe(1)
  })

  it('test 5: timeout and not delivered -> unknown, then needs_decision after 10 min', async () => {
    const { attemptId } = await approve()
    x.nextSend = 'timeout-undelivered'
    await worker.tick(new Date())

    await worker.tick(new Date(Date.now() + 2 * MIN))
    expect((await attemptOf(attemptId)).status).toBe('unknown')

    await service.reconcile(attemptId, new Date(Date.now() + 11 * MIN))
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('needs_decision')
    expect((await contactOf(attempt.contactId)).activeAttemptId).toBe(attemptId)
    expect(x.sendCalls).toBe(1)
  })

  it('test 6: stale sending on startup -> unknown -> reconciled to sent', async () => {
    const { attemptId } = await approve()
    await ds.getRepository(SendAttempt).update(attemptId, { status: 'sending', updatedAt: t0, createdAt: t0 })
    x.deliverSilently('200', 'Hi there', plus(t0, 1000))

    await service.recoverStale(plus(t0, 2 * MIN))
    expect((await attemptOf(attemptId)).status).toBe('unknown')

    await service.reconcile(attemptId, plus(t0, 3 * MIN))
    expect((await attemptOf(attemptId)).status).toBe('sent')
    expect(x.sendCalls).toBe(0)
  })

  it('test 6c: X timestamps are whole seconds, a message from the same second still matches', async () => {
    const { attemptId } = await approve()
    await ds.getRepository(SendAttempt).update(attemptId, {
      status: 'sending',
      updatedAt: t0,
      createdAt: plus(t0, 700),
    })
    x.deliverSilently('200', 'Hi there', t0)
    await service.recoverStale(plus(t0, 2 * MIN))
    await service.reconcile(attemptId, plus(t0, 3 * MIN))
    expect((await attemptOf(attemptId)).status).toBe('sent')
  })

  it('test 6b: sending newer than 60 s is left alone', async () => {
    const { attemptId } = await approve()
    await ds.getRepository(SendAttempt).update(attemptId, { status: 'sending', updatedAt: t0 })
    await service.recoverStale(plus(t0, 30_000))
    expect((await attemptOf(attemptId)).status).toBe('sending')
  })

  it('test 7a: their DM is the latest message -> the reply is sent', async () => {
    const { attemptId } = await approve()
    await worker.tick(new Date())
    expect((await attemptOf(attemptId)).status).toBe('sent')
    expect(x.sendCalls).toBe(1)
  })

  it('test 7b: the operator already replied by hand outside the app -> no send, right released', async () => {
    const { attemptId } = await approve()
    x.deliverSilently('200', 'Thanks, I will take a look', new Date(Date.now() - 60_000))
    await worker.tick(new Date())
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('failed')
    expect(attempt.error).toContain('replied outside xdm-scout')
    expect(x.sendCalls).toBe(0)
    expect((await contactOf(attempt.contactId)).activeAttemptId).toBeNull()
  })

  it('test 7c: an earlier manual reply followed by a new DM from them does not block', async () => {
    x.deliverSilently('200', 'Thanks, I will take a look', new Date(Date.now() - 3_600_000))
    const { attemptId } = await approve()
    x.priorMessage('200', 'Any update on the intro?', new Date(Date.now() - 60_000))
    await worker.tick(new Date())
    expect((await attemptOf(attemptId)).status).toBe('sent')
  })

  it('the pre-send check reads only the latest event', async () => {
    await approve()
    await worker.tick(new Date())
    expect(x.conversationReads).toEqual([{ recipientId: '200', max: 1 }])
  })

  it('test 9: rate limit -> back to queued with a retry time, still holds the right', async () => {
    const { attemptId } = await approve()
    const retryAt = new Date(Date.now() + 15 * MIN)
    x.nextSend = 'rate-limit'
    x.retryAt = retryAt
    await worker.tick(new Date())

    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('queued')
    expect(attempt.runAt?.getTime()).toBe(retryAt.getTime())
    expect((await contactOf(attempt.contactId)).activeAttemptId).toBe(attemptId)
    expect(await worker.tick(new Date())).toBe(false)

    x.nextSend = 'ok'
    expect(await worker.tick(plus(retryAt, 1000))).toBe(true)
    expect((await attemptOf(attemptId)).status).toBe('sent')
  })

  it('test 15: cannot read the conversation (revoked token) -> failed, nothing sent, right released', async () => {
    const { attemptId } = await approve()
    x.conversationError = new Error('token revoked')
    await worker.tick(new Date())
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('failed')
    expect(attempt.error).toContain('token revoked')
    expect(x.sendCalls).toBe(0)
    expect((await contactOf(attempt.contactId)).activeAttemptId).toBeNull()
  })

  it('an invitation that expires between approve and send stops the send', async () => {
    const { attemptId } = await approve()
    const later = new Date(Date.now() + 31 * 86_400_000)
    await worker.tick(later)
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('cancelled')
    expect(attempt.error).toContain('older than 30 days')
    expect(x.sendCalls).toBe(0)
    expect((await contactOf(attempt.contactId)).activeAttemptId).toBeNull()
  })

  it('a recheck_evidence job marks the posts live drafts quote that X no longer has', async () => {
    const campaign = await ds.getRepository(Campaign).save({ name: 'c', keywords: [], handles: [] })
    const draft = await seedDraft(ds, '200', 'Hi there')
    const prospect = await ds.getRepository(Prospect).save({ campaignId: campaign.id, xUserId: '200' })
    await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id, sentences: [{ text: 'Your post', source: { type: 'evidence', evidenceId: 'post:77' } }] })
    await ds.getRepository(Evidence).save({ id: 'post:77', xUserId: '200', kind: 'post', url: 'https://x.com/u/status/77', excerpt: 'gone soon', postedAt: new Date(), fetchedAt: new Date() })
    await new JobsService(ds).enqueue('recheck_evidence', { all: 1 }, new Date())
    expect(await worker.tick(new Date())).toBe(true)
    expect((await ds.getRepository(Evidence).findOneByOrFail({ id: 'post:77' })).deletedAt).not.toBeNull()
    expect((await ds.getRepository(Job).findOneByOrFail({ type: 'recheck_evidence' })).status).toBe('done')
  })

  it('test 10: Do not contact added after approve blocks the send', async () => {
    const { attemptId } = await approve()
    await ds.getRepository(DoNotContact).save({ xUserId: '200', reason: 'asked to stop', source: 'test' })
    await worker.tick(new Date())
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('cancelled')
    expect(x.sendCalls).toBe(0)
    expect((await contactOf(attempt.contactId)).activeAttemptId).toBeNull()
  })

  it('an inbound_check job attaches the call DMs of its campaign', async () => {
    await ds.getRepository(SenderAccount).save({ id: 1, xUserId: '100', handle: 'fund' })
    const c = await ds.getRepository(Campaign).save({ name: 'c', keywords: [], handles: [], callKeyword: 'build', callPostedAt: new Date('2026-11-10T09:00:00Z') })
    x.addInboundDm({ senderId: '200', handle: 'mina_builds', text: 'build', createdAt: new Date('2026-11-11T10:00:00Z') })
    await new JobsService(ds).enqueue('inbound_check', { campaignId: c.id }, new Date())
    expect(await worker.tick(new Date())).toBe(true)
    expect(await ds.getRepository(Prospect).countBy({ campaignId: c.id, source: 'call' })).toBe(1)
    expect((await ds.getRepository(Job).findOneByOrFail({ type: 'inbound_check' })).status).toBe('done')
  })

  it('a draft job asks the model checks right away, and a failed check does not fail the draft', async () => {
    const jobs = new JobsService(ds)
    const warmed: number[] = []
    const drafts = { generate: async () => 42 } as unknown as DraftService
    const review = { warm: async (id: number) => { warmed.push(id); throw new Error('model down') } } as unknown as ReviewService
    const w = new Worker(jobs, service, undefined as never, undefined as never, drafts, undefined as never, undefined as never, undefined as never, review)
    await jobs.enqueue('draft', { prospectId: 1 }, new Date())
    expect(await w.tick(new Date())).toBe(true)
    expect(warmed).toEqual([42])
    expect((await ds.getRepository(Job).findOneByOrFail({ type: 'draft' })).status).toBe('done')
  })

  it('a model lane takes only score and draft jobs, so sends stay one at a time', async () => {
    const jobs = new JobsService(ds)
    await jobs.enqueue('send', { attemptId: 1 }, plus(t0, -MIN))
    await jobs.enqueue('draft', { prospectId: 7 }, t0)
    const lane = await jobs.claimNext(new Date(), MODEL_JOBS)
    expect(lane?.type).toBe('draft')
    expect(await jobs.claimNext(new Date(), MODEL_JOBS)).toBeNull()
    expect((await jobs.claimNext(new Date()))?.type).toBe('send')
  })

  it('a model job that hits a database deadlock goes back in the queue instead of failing', async () => {
    const jobs = new JobsService(ds)
    const deadlock = Object.assign(new Error('Deadlock found when trying to get lock; try restarting transaction'), { errno: 1213 })
    const drafts = { generate: async () => { throw deadlock } } as unknown as DraftService
    const w = new Worker(jobs, service, undefined as never, undefined as never, drafts, undefined as never, undefined as never, undefined as never)
    await jobs.enqueue('draft', { prospectId: 1 }, new Date())
    await w.tick(new Date())
    expect(await ds.getRepository(Job).findOneByOrFail({ type: 'draft' })).toMatchObject({ status: 'pending', error: null })
  })

  it('a model job that fails is tried again later, 3 tries in all, each wait longer than the last', async () => {
    const jobs = new JobsService(ds)
    const drafts = { generate: async () => { throw new Error('OpenAI returned 503') } } as unknown as DraftService
    const w = new Worker(jobs, service, undefined as never, undefined as never, drafts, undefined as never, undefined as never, undefined as never)
    await jobs.enqueue('draft', { prospectId: 1 }, t0)
    const waits: number[] = []
    let now = t0
    for (let i = 0; i < 3; i++) {
      expect(await w.tick(now)).toBe(true)
      const job = await ds.getRepository(Job).findOneByOrFail({ type: 'draft' })
      if (job.status === 'pending') waits.push(job.runAt.getTime() - now.getTime())
      // Not due yet: nothing to claim.
      if (i === 0) expect(await w.tick(now)).toBe(false)
      now = job.runAt
    }
    expect(waits).toHaveLength(2)
    expect(waits[1]).toBeGreaterThan(waits[0])
    expect(await ds.getRepository(Job).findOneByOrFail({ type: 'draft' })).toMatchObject({ status: 'failed', error: 'OpenAI returned 503', attempts: 3 })
  })

  it('a job that is not a model job is not tried again', async () => {
    const jobs = new JobsService(ds)
    const w = new Worker(jobs, service, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never)
    await jobs.enqueue('bogus', {}, t0)
    await w.tick(t0)
    expect(await ds.getRepository(Job).findOneByOrFail({ type: 'bogus' })).toMatchObject({ status: 'failed', attempts: 1 })
  })
})
