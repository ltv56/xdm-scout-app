import 'reflect-metadata'
import { randomBytes } from 'node:crypto'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthService } from '../auth/auth.service'
import { Campaign, Prospect } from '../discovery/entities'
import { InboxService } from '../inbox/inbox.service'
import { Evidence } from '../fit/entities'
import { Reply } from '../inbox/reply.entity'
import { PreflightService, recordHeartbeat } from '../preflight/preflight.service'
import { AttemptStatus, Contact, Draft, SendAttempt } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { seedDraft, sha } from '../test/seed'
import { AttentionService } from './attention.service'

let ds: DataSource
let auth: AuthService
let service: AttentionService
const NOW = new Date('2026-11-14T12:00:00Z')

async function seedAttempt(xUserId: string, status: AttemptStatus, error: string | null = null) {
  if (!(await ds.getRepository(Campaign).findOneBy({ id: 1 }))) await ds.getRepository(Campaign).save({ id: 1, name: 'c1', keywords: [], handles: [] })
  const draft = await seedDraft(ds, xUserId, `Hi ${xUserId}`)
  const prospect = await ds.getRepository(Prospect).save({ campaignId: 1, xUserId })
  await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id, status: 'approved', approvedHash: sha(draft.content) })
  const attempt = await ds.getRepository(SendAttempt).save({ contactId: draft.contactId, draftId: draft.id, route: 'api', status, contentHash: sha(draft.content), error })
  await ds.getRepository(Contact).update(draft.contactId, { activeAttemptId: attempt.id })
  return { draft, attempt }
}

const reply = (a: Awaited<ReturnType<typeof seedAttempt>>, text: string, replyClass: Reply['replyClass'], extra: Partial<Reply> = {}) =>
  ds.getRepository(Reply).save({ contactId: a.draft.contactId, attemptId: a.attempt.id, xEventId: `e-${text}`, text, source: 'api', at: new Date('2026-11-13T10:00:00Z'), replyClass, classBy: 'llm', ...extra })

beforeEach(async () => {
  ds = await createTestDataSource()
  auth = new AuthService(ds, { clientId: 'cid', clientSecret: 's', redirectUri: 'http://x/cb', tokenKey: randomBytes(32).toString('base64') })
  const env = { get: (_k: string, d = '') => d }
  service = new AttentionService(ds, new InboxService(ds), new PreflightService(ds, auth, env))
  await auth.connectFake()
  await recordHeartbeat(ds, new Date(NOW.getTime() - 5_000))
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('AttentionService', () => {
  it('has nothing to say when the sender is connected, the worker runs and nothing waits', async () => {
    await ds.getRepository(Campaign).save({ id: 1, name: 'c1', keywords: [], handles: [] })
    expect(await service.list(1, NOW)).toEqual([])
  })

  it('flags a missing X account and a stopped worker first', async () => {
    await ds.query('DELETE FROM sender_accounts')
    await ds.query('DELETE FROM settings')
    await ds.getRepository(Campaign).save({ id: 1, name: 'c1', keywords: [], handles: [] })
    const items = await service.list(1, NOW)
    expect(items.map((i) => [i.kind, i.priority, i.goTo])).toEqual([
      ['x_disconnected', 1, 'profile'],
      ['worker_stopped', 1, null],
    ])
    expect(items[0].reason).toBe('X connection expired. Reconnect to continue.')
  })

  it('lists replies that need a person, Interested first, and skips handled and no-action ones', async () => {
    const a = await seedAttempt('201', 'sent')
    const b = await seedAttempt('202', 'sent')
    const c = await seedAttempt('203', 'sent')
    const d = await seedAttempt('204', 'sent')
    const e = await seedAttempt('205', 'sent')
    await reply(a, 'What is the program?', 'Question')
    await reply(b, 'Yes, tell me more', 'Interested')
    await reply(c, 'maybe later', 'Not now')
    await reply(d, 'already done', 'Interested', { handledAt: new Date('2026-11-13T11:00:00Z') })
    await reply(e, '??', 'Unclear')

    const items = await service.list(1, NOW)
    expect(items.map((i) => [i.kind, i.title, i.priority])).toEqual([
      ['reply', 'u202', 1],
      ['reply', 'u201', 2],
      ['reply', 'u205', 2],
    ])
    expect(items[0].reason).toContain('Interested')
    expect(items[0].reason).toContain('Yes, tell me more')
    expect(items[0].goTo).toBe('inbox')
  })

  it('lists sends to check in X and failed sends with their reason', async () => {
    await seedAttempt('201', 'manual_unverified')
    await seedAttempt('202', 'needs_decision')
    await seedAttempt('203', 'failed', "X says this person doesn't accept DMs from this account.")
    const items = await service.list(1, NOW)
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['check', 'u201'],
      ['check', 'u202'],
      ['failed', 'u203'],
    ])
    expect(items[2].reason).toBe("X says this person doesn't accept DMs from this account.")
  })

  it('warns when discovery stopped at the budget', async () => {
    await ds.getRepository(Campaign).save({
      id: 1,
      name: 'c1',
      keywords: [],
      handles: [],
      budgetMicros: 1_000_000,
      lastDiscovery: { at: '2026-11-14T10:00:00Z', added: 3, skipped: [], spentMicros: 1_000_000, stoppedByBudget: true, postsPending: 0 },
    })
    const [item] = await service.list(1, NOW)
    expect(item).toMatchObject({ kind: 'budget_out', priority: 3, goTo: 'overview' })
    expect(item.reason).toContain('$1.00')
  })
  it('names a send that stopped because someone already answered by hand', async () => {
    await seedAttempt('201', 'failed', 'Someone already replied outside xdm-scout')
    const [item] = await service.list(1, NOW)
    expect(item).toMatchObject({ kind: 'outside_reply', title: 'u201', reason: 'Someone already replied outside xdm-scout. Read the conversation in X before sending anything.', goTo: 'inbox' })
  })

  describe('evidence post deleted', () => {
    const citing = async (xUserId: string, status: Draft['status'], deleted: boolean) => {
      const { draft } = await seedAttempt(xUserId, 'approved')
      await ds.getRepository(Evidence).save({ id: `ev-${xUserId}`, xUserId, kind: 'post', url: 'https://x.com/a/status/1', excerpt: deleted ? '' : 'text', fetchedAt: NOW, deletedAt: deleted ? NOW : null })
      await ds.getRepository(Draft).update(draft.id, { status, sentences: [{ text: 'Your post on agents was sharp.', source: { type: 'evidence', evidenceId: `ev-${xUserId}` } }] })
    }

    it('flags a live draft that cites a post X no longer has', async () => {
      await citing('201', 'pending', true)
      const items = (await service.list(1, NOW)).filter((i) => i.kind === 'evidence_deleted')
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({ title: 'u201', reason: 'A post this draft quotes was deleted on X. Open the draft and fix or skip it.', goTo: 'review' })
    })

    it('ignores skipped drafts and posts that still exist', async () => {
      await citing('201', 'skipped', true)
      await citing('202', 'pending', false)
      expect((await service.list(1, NOW)).filter((i) => i.kind === 'evidence_deleted')).toEqual([])
    })
  })
})
