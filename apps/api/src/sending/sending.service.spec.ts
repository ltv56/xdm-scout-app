import 'reflect-metadata'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Evidence } from '../fit/entities'
import { Reply } from '../inbox/reply.entity'
import { Job } from '../jobs/job.entity'
import { Setting } from '../setting.entity'
import { JobsService } from '../jobs/jobs.service'
import { createTestDataSource } from '../test/db'
import { seedDraft as seed, sha } from '../test/seed'
import { FakeXClient } from '../x/fake-x-client'
import { Contact, DoNotContact, Draft, SendAttempt } from './entities'
import { DEFAULT_DAILY_CAP, dailyCap, sentToday } from './daily-cap'
import { SendingService } from './sending.service'

let ds: DataSource
let x: FakeXClient
let service: SendingService

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  service = new SendingService(ds, x, new JobsService(ds))
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const seedDraft = (xUserId = '200', content = 'Hi there') => seed(ds, xUserId, content)
const sendJobs = () => ds.getRepository(Job).countBy({ type: 'send' })
const queued = async (draft: Draft) => {
  await service.approve(draft.id, sha(draft.content))
  return service.send(draft.id, sha(draft.content))
}

describe('approve', () => {
  it('holds the send right in an approved attempt and queues nothing', async () => {
    const draft = await seedDraft()
    const { attemptId } = await service.approve(draft.id, sha(draft.content))
    expect(await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })).toMatchObject({ status: 'approved', route: 'api' })
    expect((await ds.getRepository(Contact).findOneByOrFail({ id: draft.contactId })).activeAttemptId).toBe(attemptId)
    expect(await ds.getRepository(Draft).findOneByOrFail({ id: draft.id })).toMatchObject({ status: 'approved', approvedHash: sha(draft.content) })
    expect(await sendJobs()).toBe(0)
  })

  it('the worker never picks up an approved attempt', async () => {
    const draft = await seedDraft()
    const { attemptId } = await service.approve(draft.id, sha(draft.content))
    expect(await new JobsService(ds).claimNext(new Date())).toBeNull()
    await service.processAttempt(attemptId)
    expect((await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })).status).toBe('approved')
    expect(x.sendCalls).toBe(0)
  })

  it('test 1: second click says Already queued, one attempt', async () => {
    const draft = await seedDraft()
    await service.approve(draft.id, sha(draft.content))
    await expect(service.approve(draft.id, sha(draft.content))).rejects.toThrow('Already queued')
    expect(await ds.getRepository(SendAttempt).count()).toBe(1)
  })

  it('test 2: two parallel approvals create one attempt', async () => {
    const draft = await seedDraft()
    const results = await Promise.allSettled([
      service.approve(draft.id, sha(draft.content)),
      service.approve(draft.id, sha(draft.content)),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await ds.getRepository(SendAttempt).count()).toBe(1)
  })

  it('test 3: a second draft for the same person cannot send', async () => {
    const first = await seedDraft()
    const second = await ds.getRepository(Draft).save({ contactId: first.contactId, content: 'Other opening' })
    await service.approve(first.id, sha(first.content))
    await expect(service.approve(second.id, sha(second.content))).rejects.toThrow('Already queued')
    expect(await ds.getRepository(SendAttempt).count()).toBe(1)
  })

  it('rejects when the content hash differs from what the reviewer saw', async () => {
    const draft = await seedDraft()
    await expect(service.approve(draft.id, sha('something else'))).rejects.toThrow('changed')
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
  })

  it('rejects a person on Do not contact', async () => {
    const draft = await seedDraft()
    await ds.getRepository(DoNotContact).save({ xUserId: '200', reason: 'asked to stop', source: 'test' })
    await expect(service.approve(draft.id, sha(draft.content))).rejects.toThrow('Do not contact')
  })

  it('test 18: a person who never messaged first cannot be sent by API', async () => {
    const draft = await seed(ds, '200', 'Hi there', { recipientPermission: 'none', invitationEventId: null, invitationAt: null })
    await expect(service.approve(draft.id, sha(draft.content))).rejects.toThrow('messaged you first')
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
  })

  it('requested_dm without the invitation DM on record is not enough', async () => {
    const draft = await seed(ds, '200', 'Hi there', { invitationEventId: null })
    await expect(service.approve(draft.id, sha(draft.content))).rejects.toThrow('messaged you first')
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
  })

  it('rejects a draft that was skipped or replaced', async () => {
    const draft = await seedDraft()
    await ds.getRepository(Draft).update(draft.id, { status: 'skipped' })
    await expect(service.approve(draft.id, sha(draft.content))).rejects.toThrow('no longer')
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
  })

  it('an invitation older than 30 days moves the person to sending by hand', async () => {
    const draft = await seed(ds, '200', 'Hi there', { invitationAt: new Date(Date.now() - 31 * 86_400_000) })
    await expect(service.approve(draft.id, sha(draft.content))).rejects.toThrow('older than 30 days')
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
  })
})

describe('send', () => {
  it('moves the approved attempt to queued and enqueues one job', async () => {
    const draft = await seedDraft()
    const { attemptId } = await service.approve(draft.id, sha(draft.content))
    expect(await service.send(draft.id, sha(draft.content))).toEqual({ attemptId })
    expect((await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })).status).toBe('queued')
    expect(await sendJobs()).toBe(1)
  })

  it('sending twice, also in parallel, gives one job', async () => {
    const draft = await seedDraft()
    await service.approve(draft.id, sha(draft.content))
    const results = await Promise.allSettled([service.send(draft.id, sha(draft.content)), service.send(draft.id, sha(draft.content))])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await expect(service.send(draft.id, sha(draft.content))).rejects.toBeInstanceOf(ConflictException)
    expect(await sendJobs()).toBe(1)
  })

  it('needs the hash that was approved', async () => {
    const draft = await seedDraft()
    const { attemptId } = await service.approve(draft.id, sha(draft.content))
    await expect(service.send(draft.id, sha('something else'))).rejects.toThrow('The draft changed since you read it')
    await ds.getRepository(Draft).update(draft.id, { content: 'Changed in the database' })
    await expect(service.send(draft.id, sha('Changed in the database'))).rejects.toThrow('The draft changed since you read it')
    expect((await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })).status).toBe('approved')
    expect(await sendJobs()).toBe(0)
  })

  it('refuses a draft that was not approved', async () => {
    const draft = await seedDraft()
    await expect(service.send(draft.id, sha(draft.content))).rejects.toBeInstanceOf(ConflictException)
    expect(await sendJobs()).toBe(0)
  })

  it('checks Do not contact and the invitation again', async () => {
    const draft = await seedDraft()
    await service.approve(draft.id, sha(draft.content))
    await ds.getRepository(Contact).update(draft.contactId, { invitationAt: new Date(Date.now() - 31 * 86_400_000) })
    await expect(service.send(draft.id, sha(draft.content))).rejects.toThrow('older than 30 days')
    await ds.getRepository(Contact).update(draft.contactId, { invitationAt: new Date() })
    await ds.getRepository(DoNotContact).save({ xUserId: '200', reason: 'asked to stop', source: 'test' })
    await expect(service.send(draft.id, sha(draft.content))).rejects.toBeInstanceOf(ForbiddenException)
    expect(await sendJobs()).toBe(0)
  })

  it('refuses when the attempt no longer holds the send right', async () => {
    const draft = await seedDraft()
    await service.approve(draft.id, sha(draft.content))
    await ds.getRepository(Contact).update(draft.contactId, { activeAttemptId: null })
    await expect(service.send(draft.id, sha(draft.content))).rejects.toBeInstanceOf(ConflictException)
    expect(await sendJobs()).toBe(0)
  })
})

describe('processAttempt', () => {
  it('sends once and marks the attempt sent', async () => {
    const draft = await seedDraft()
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    const attempt = await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })
    expect(attempt.status).toBe('sent')
    expect(attempt.xEventId).toBeTruthy()
    expect(x.sent).toEqual([{ recipientId: '200', text: 'Hi there' }])
  })

  it('never sends text that differs from the approved hash', async () => {
    const draft = await seedDraft()
    const { attemptId } = await queued(draft)
    await ds.getRepository(Draft).update(draft.id, { content: 'Edited after approval' })
    await service.processAttempt(attemptId)
    const attempt = await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })
    expect(attempt.status).toBe('cancelled')
    expect(attempt.error).toContain('changed after approval')
    expect(x.sendCalls).toBe(0)
    expect((await ds.getRepository(Contact).findOneByOrFail({ id: draft.contactId })).activeAttemptId).toBeNull()
  })

  it('a definite error from X fails the attempt and frees the send right', async () => {
    const draft = await seedDraft()
    x.nextSend = 'rejected'
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    const attempt = await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })
    expect(attempt.status).toBe('failed')
    expect(attempt.error).toContain('X returned 400')
    expect((await ds.getRepository(Contact).findOneByOrFail({ id: draft.contactId })).activeAttemptId).toBeNull()
  })

  it('test 8: recipient not accepting DMs -> failed, send right released', async () => {
    const draft = await seedDraft()
    x.nextSend = 'not-accepting'
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    const attempt = await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })
    expect(attempt.status).toBe('failed')
    expect(attempt.error).toContain("doesn't accept DMs from this account")
    const contact = await ds.getRepository(Contact).findOneByOrFail({ id: draft.contactId })
    expect(contact.activeAttemptId).toBeNull()
  })
})

describe('processAttempt with quoted posts', () => {
  const quoting = async (...ids: string[]) => {
    const draft = await seedDraft()
    await ds.getRepository(Draft).update(draft.id, { sentences: ids.map((evidenceId) => ({ text: `About ${evidenceId}`, source: { type: 'evidence' as const, evidenceId } })) })
    for (const id of ids) await ds.getRepository(Evidence).save({ id, xUserId: '200', kind: 'post', url: `https://x.com/u/status/${id}`, excerpt: `text of ${id}`, postedAt: new Date(), fetchedAt: new Date() })
    return draft
  }
  const attemptOf = (id: number) => ds.getRepository(SendAttempt).findOneByOrFail({ id })

  it('sends when every quoted post is still on X', async () => {
    const draft = await quoting('post:1')
    x.addPosts('200', [{ id: '1', userId: '200', text: 't', createdAt: new Date() }])
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    expect((await attemptOf(attemptId)).status).toBe('sent')
    expect(x.postExistReads).toEqual([['1']])
  })

  it('cancels with a clear reason when a quoted post is gone from X, and marks it deleted', async () => {
    const draft = await quoting('post:1', 'post:2')
    x.addPosts('200', [{ id: '1', userId: '200', text: 't', createdAt: new Date() }])
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('cancelled')
    expect(attempt.error).toBe('A post this message quotes was deleted on X. Fix or skip the draft.')
    expect(x.sendCalls).toBe(0)
    expect((await ds.getRepository(Evidence).findOneByOrFail({ id: 'post:2' })).deletedAt).not.toBeNull()
    expect((await ds.getRepository(Contact).findOneByOrFail({ id: draft.contactId })).activeAttemptId).toBeNull()
  })

  it('cancels without asking X when the recheck already found the post deleted', async () => {
    const draft = await quoting('post:1')
    await ds.getRepository(Evidence).update('post:1', { deletedAt: new Date(), excerpt: '' })
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    expect((await attemptOf(attemptId)).status).toBe('cancelled')
    expect(x.postExistReads).toEqual([])
    expect(x.sendCalls).toBe(0)
  })

  it('does not call X about posts when the draft quotes none', async () => {
    const draft = await seedDraft()
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    expect(x.postExistReads).toEqual([])
    expect((await attemptOf(attemptId)).status).toBe('sent')
  })

  it('fails the attempt without sending when X cannot answer about the posts', async () => {
    const draft = await quoting('post:1')
    x.postExistError = new Error('X is down')
    const { attemptId } = await queued(draft)
    await service.processAttempt(attemptId)
    const attempt = await attemptOf(attemptId)
    expect(attempt.status).toBe('failed')
    expect(attempt.error).toContain('Could not check the posts this message quotes')
    expect(x.sendCalls).toBe(0)
  })
})

describe('unconfirmed stop', () => {
  const MSG = 'Confirm or dismiss their reply first'
  const stopReply = (contactId: number, patch: Partial<Reply> = {}) =>
    ds.getRepository(Reply).save({ contactId, attemptId: 0, xEventId: `r${Math.random()}`, text: 'no thanks', source: 'api', at: new Date(), replyClass: 'Not interested', classBy: 'llm', ...patch } as Reply)

  it('approve refuses while a model-decided stop is unconfirmed', async () => {
    const draft = await seedDraft()
    await stopReply(draft.contactId)
    await expect(service.approve(draft.id, sha(draft.content))).rejects.toThrow(MSG)
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
  })

  it('approve also refuses the by-hand route', async () => {
    const draft = await seedDraft()
    await stopReply(draft.contactId, { replyClass: 'Opt-out' })
    await expect(service.approve(draft.id, sha(draft.content), 'manual')).rejects.toThrow(MSG)
  })

  it('send refuses when the stop arrived after approval', async () => {
    const draft = await seedDraft()
    await service.approve(draft.id, sha(draft.content))
    await stopReply(draft.contactId)
    await expect(service.send(draft.id, sha(draft.content))).rejects.toThrow(MSG)
    expect(await sendJobs()).toBe(0)
  })

  it('processAttempt cancels an attempt queued before the stop arrived', async () => {
    const draft = await seedDraft()
    const { attemptId } = await queued(draft)
    await stopReply(draft.contactId)
    await service.processAttempt(attemptId)
    expect(await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })).toMatchObject({ status: 'cancelled', error: MSG })
    expect((await ds.getRepository(Contact).findOneByOrFail({ id: draft.contactId })).activeAttemptId).toBeNull()
    expect(x.sendCalls).toBe(0)
  })

  it('confirming the stop lifts the block', async () => {
    const draft = await seedDraft()
    const reply = await stopReply(draft.contactId)
    await ds.getRepository(Reply).update(reply.id, { classBy: 'operator' })
    await expect(service.approve(draft.id, sha(draft.content))).resolves.toBeDefined()
  })

  it('marking the reply handled lifts the block', async () => {
    const draft = await seedDraft()
    const reply = await stopReply(draft.contactId)
    await ds.getRepository(Reply).update(reply.id, { handledAt: new Date() })
    await expect(service.approve(draft.id, sha(draft.content))).resolves.toBeDefined()
  })

  it('a rule-decided or Not now reply does not block', async () => {
    const draft = await seedDraft()
    await stopReply(draft.contactId, { classBy: 'rule' })
    await stopReply(draft.contactId, { replyClass: 'Not now' })
    await expect(service.approve(draft.id, sha(draft.content))).resolves.toBeDefined()
  })
})

describe('daily cap', () => {
  const capAt = (n: number) => ds.getRepository(Setting).save({ key: 'send.dailyCap', value: String(n) })

  it('refuses a send once today is full and enqueues nothing more', async () => {
    await capAt(1)
    await queued(await seedDraft('201', 'First'))
    const second = await seedDraft('202', 'Second')
    await service.approve(second.id, sha(second.content))
    await expect(service.send(second.id, sha(second.content))).rejects.toThrow('Daily send limit reached')
    expect(await sendJobs()).toBe(1)
    expect((await ds.getRepository(SendAttempt).findOneByOrFail({ draftId: second.id })).status).toBe('approved')
  })

  it('does not count yesterday', async () => {
    await capAt(1)
    const first = await queued(await seedDraft('201', 'First'))
    await ds.getRepository(SendAttempt).update(first.attemptId, { status: 'sent', updatedAt: new Date(Date.now() - 2 * 86_400_000) })
    await expect(queued(await seedDraft('202', 'Second'))).resolves.toBeDefined()
  })

  it('two sends at once cannot pass the cap together', async () => {
    await capAt(1)
    const a = await seedDraft('201', 'First')
    const b = await seedDraft('202', 'Second')
    await service.approve(a.id, sha(a.content))
    await service.approve(b.id, sha(b.content))
    const results = await Promise.allSettled([service.send(a.id, sha(a.content)), service.send(b.id, sha(b.content))])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await sendJobs()).toBe(1)
  })

  it('keeps counting an attempt that needs a decision, because X may have taken it', async () => {
    await capAt(1)
    const first = await queued(await seedDraft('201', 'First'))
    await ds.getRepository(SendAttempt).update(first.attemptId, { status: 'needs_decision' })
    const second = await seedDraft('202', 'Second')
    await service.approve(second.id, sha(second.content))
    await expect(service.send(second.id, sha(second.content))).rejects.toThrow('Daily send limit reached')
  })

  it('falls back to the default when the stored cap is not a number', async () => {
    for (const bad of ['null', 'false', '""', '"abc"', '-1', '1.5']) {
      await ds.query('REPLACE INTO settings (`key`, value) VALUES (?, ?)', ['send.dailyCap', bad])
      expect(await dailyCap(ds.manager)).toBe(DEFAULT_DAILY_CAP)
    }
    await ds.getRepository(Setting).save({ key: 'send.dailyCap', value: '7' })
    expect(await dailyCap(ds.manager)).toBe(7)
    await ds.getRepository(Setting).save({ key: 'send.dailyCap', value: 0 })
    expect(await dailyCap(ds.manager)).toBe(0)
  })

  it('a hand-sent message verified later still counts for the day it was reported', async () => {
    const d = await seedDraft('201', 'Hand')
    const { attemptId } = await service.approve(d.id, sha(d.content), 'manual')
    await ds.getRepository(SendAttempt).update(attemptId, { status: 'manual_unverified', updatedAt: new Date(Date.now() - 2 * 86_400_000) })
    await x.sendDm('201', d.content)
    await service.verifyManual(attemptId)
    expect(await ds.getRepository(SendAttempt).findOneByOrFail({ id: attemptId })).toMatchObject({ status: 'sent' })
    expect(await sentToday(ds.manager, new Date())).toBe(0)
  })
})
