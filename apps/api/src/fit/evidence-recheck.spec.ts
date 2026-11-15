import 'reflect-metadata'
import { randomBytes } from 'node:crypto'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AttentionService } from '../attention/attention.service'
import { AuthService } from '../auth/auth.service'
import { ApiUsage, Campaign, Prospect } from '../discovery/entities'
import { InboxService } from '../inbox/inbox.service'
import { Job } from '../jobs/job.entity'
import { JobsService } from '../jobs/jobs.service'
import { PreflightService } from '../preflight/preflight.service'
import { Draft } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { seedDraft } from '../test/seed'
import { FakeXClient } from '../x/fake-x-client'
import { Evidence } from './entities'
import { EvidenceRecheckService } from './evidence-recheck.service'

let ds: DataSource
let x: FakeXClient
let service: EvidenceRecheckService
const NOW = new Date('2026-11-15T10:00:00Z')

const evidence = (id: string, xUserId = '200') =>
  ds.getRepository(Evidence).save({ id, xUserId, kind: id.startsWith('bio:') ? 'bio' : 'post', url: `https://x.com/u/status/${id}`, excerpt: `text of ${id}`, postedAt: NOW, fetchedAt: NOW })

// A live draft of a person in campaign 1 that quotes these evidence rows.
async function draftCiting(xUserId: string, ids: string[], status: Draft['status'] = 'pending') {
  if (!(await ds.getRepository(Campaign).findOneBy({ id: 1 }))) await ds.getRepository(Campaign).save({ id: 1, name: 'c', keywords: [], handles: [] })
  const draft = await seedDraft(ds, xUserId, `Hi ${xUserId}`)
  const prospect = await ds.getRepository(Prospect).save({ campaignId: 1, xUserId })
  const sentences = ids.map((evidenceId) => ({ text: `About ${evidenceId}`, source: { type: 'evidence' as const, evidenceId } }))
  await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id, status, sentences })
  return draft
}

const onX = (...ids: string[]) => x.addPosts('200', ids.map((id) => ({ id, userId: '200', text: 'still there', createdAt: NOW })))
const row = (id: string) => ds.getRepository(Evidence).findOneByOrFail({ id })

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  service = new EvidenceRecheckService(ds, x, new JobsService(ds))
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('recheckLive', () => {
  it('marks a cited post X no longer has as deleted and clears its excerpt, and leaves the others', async () => {
    await evidence('post:1')
    await evidence('post:2')
    await draftCiting('200', ['post:1', 'post:2'])
    onX('1')

    await service.recheckLive(NOW)

    expect(await row('post:1')).toMatchObject({ deletedAt: null, excerpt: 'text of post:1' })
    expect(await row('post:2')).toMatchObject({ deletedAt: NOW, excerpt: '' })
  })

  it('asks only about posts cited by pending or approved drafts, never about a bio, and not twice about a deleted one', async () => {
    await evidence('post:1')
    await evidence('post:3', '201')
    await evidence('bio:200')
    await evidence('post:9')
    await draftCiting('200', ['post:1', 'bio:200'], 'approved')
    await draftCiting('201', ['post:3'], 'skipped')
    await ds.getRepository(Evidence).update('post:9', { deletedAt: new Date('2026-11-14T00:00:00Z'), excerpt: '' })
    await draftCiting('202', ['post:9'])
    onX('1')

    await service.recheckLive(NOW)

    expect(x.postExistReads).toEqual([['1']])
    expect((await row('post:3')).deletedAt).toBeNull()
    expect((await row('post:9')).deletedAt).toEqual(new Date('2026-11-14T00:00:00Z'))
  })

  it('does nothing and reads nothing when no live draft quotes a post', async () => {
    await evidence('post:1')
    await service.recheckLive(NOW)
    expect(x.postExistReads).toEqual([])
  })

  it('counts the posts it read as post usage of the campaign', async () => {
    await evidence('post:1')
    await evidence('post:2')
    await draftCiting('200', ['post:1', 'post:2'])
    onX('1')
    await service.recheckLive(NOW)
    expect((await ds.getRepository(ApiUsage).findBy({ campaignId: 1 })).map((u) => [u.kind, u.count, u.costMicros])).toEqual([['post', 2, 10_000]])
  })

  it('makes the existing Needs attention item appear', async () => {
    await evidence('post:2')
    await draftCiting('200', ['post:2'])
    await service.recheckLive(NOW)
    const auth = new AuthService(ds, { clientId: 'cid', clientSecret: 's', redirectUri: 'http://x/cb', tokenKey: randomBytes(32).toString('base64') })
    const env = { get: (_k: string, d = '') => d }
    const items = await new AttentionService(ds, new InboxService(ds), new PreflightService(ds, auth, env)).list(1, NOW)
    expect(items.filter((i) => i.kind === 'evidence_deleted')).toHaveLength(1)
  })
})

describe('scheduleDaily', () => {
  const jobs = () => ds.getRepository(Job).findBy({ type: 'recheck_evidence' })

  it('queues one recheck a day', async () => {
    await service.scheduleDaily(NOW)
    await service.scheduleDaily(new Date(NOW.getTime() + 60 * 60_000))
    expect(await jobs()).toHaveLength(1)

    await ds.getRepository(Job).update({ type: 'recheck_evidence' }, { status: 'done' })
    await service.scheduleDaily(new Date(NOW.getTime() + 23 * 60 * 60_000))
    expect(await jobs()).toHaveLength(1)
    await service.scheduleDaily(new Date(NOW.getTime() + 25 * 60 * 60_000))
    expect(await jobs()).toHaveLength(2)
  })

  it('does not queue a second recheck while one is open', async () => {
    await service.scheduleDaily(NOW)
    await service.scheduleDaily(new Date(NOW.getTime() + 48 * 60 * 60_000))
    expect(await jobs()).toHaveLength(1)
  })
})
