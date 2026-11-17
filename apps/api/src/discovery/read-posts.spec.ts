import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { XUser } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { DiscoveryService } from './discovery.service'
import { ApiUsage, Campaign, Prospect, XPost } from './entities'

let ds: DataSource
let x: FakeXClient
let discovery: DiscoveryService
let prospectId: number
const now = new Date('2026-11-17T10:00:00Z')

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  discovery = new DiscoveryService(ds, x)
  x.addProfile({ id: '501', handle: 'harold', name: 'Harold', bio: 'robotics researcher', followers: 400 })
  x.addPosts('501', [
    { id: '9001', userId: '501', text: 'New paper on robot learning', createdAt: new Date('2026-11-15T10:00:00Z') },
    { id: '9002', userId: '501', text: 'Lab is hiring', createdAt: new Date('2026-11-10T10:00:00Z') },
  ])
  await ds.getRepository(XUser).save({ xUserId: '501', handle: 'harold', name: 'Harold', bio: 'robotics researcher', followers: 400, fetchedAt: now })
  // The search already spent 98 cents of a one dollar budget.
  await ds.getRepository(Campaign).save({ id: 1, name: 'c', keywords: ['robotics'], handles: ['harold'], budgetMicros: 1_000_000 })
  await ds.getRepository(ApiUsage).save({ campaignId: 1, kind: 'profile', count: 98, costMicros: 980_000 })
  prospectId = (await ds.getRepository(Prospect).save({ campaignId: 1, xUserId: '501', fit: 'possible', scoredAt: now })).id
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe("reading one person's posts after the budget ran out", () => {
  it('refuses without the go-ahead to raise the budget, says how much it needs, and reads nothing', async () => {
    await expect(discovery.readPostsFor(1, prospectId, { raiseBudget: false }, now)).rejects.toThrow(/\$0\.08.*\$1\.00/)
    expect(await ds.getRepository(XPost).count()).toBe(0)
  })

  it('with the go-ahead, raises the budget just enough, reads the posts and reports the real cost', async () => {
    const r = await discovery.readPostsFor(1, prospectId, { raiseBudget: true }, now)
    expect(r).toEqual({ posts: 2, costMicros: 10_000, spentMicros: 990_000, budgetMicros: 1_055_000 })
    expect(await ds.getRepository(XPost).count()).toBe(2)
    expect((await ds.getRepository(Campaign).findOneByOrFail({ id: 1 })).budgetMicros).toBe(1_055_000)
  })

  it('does not touch the budget when there is room', async () => {
    await ds.getRepository(Campaign).update(1, { budgetMicros: 2_000_000 })
    const r = await discovery.readPostsFor(1, prospectId, { raiseBudget: false }, now)
    expect(r).toMatchObject({ posts: 2, budgetMicros: 2_000_000 })
  })

  it('is not found for a person of another campaign', async () => {
    await expect(discovery.readPostsFor(2, prospectId, { raiseBudget: true }, now)).rejects.toThrow(/not found/i)
  })
})

describe('reading posts for everyone the search left unread', () => {
  beforeEach(async () => {
    x.addProfile({ id: '502', handle: 'linh', bio: 'robotics founder' })
    x.addPosts('502', [{ id: '9101', userId: '502', text: 'Shipped v2', createdAt: new Date('2026-11-16T10:00:00Z') }])
    x.addProfile({ id: '503', handle: 'tam', bio: 'robotics' })
    x.addPosts('503', [{ id: '9201', userId: '503', text: 'old post', createdAt: new Date('2026-11-01T10:00:00Z') }])
    await ds.getRepository(XUser).save([
      { xUserId: '502', handle: 'linh', bio: 'robotics founder', fetchedAt: now },
      { xUserId: '503', handle: 'tam', bio: 'robotics', fetchedAt: now },
    ])
    await ds.getRepository(Prospect).save([
      { campaignId: 1, xUserId: '502' },
      { campaignId: 1, xUserId: '503' },
    ])
    // Tam's posts were read already; only Harold and Linh are waiting.
    await ds.getRepository(XPost).save({ postId: '9201', xUserId: '503', text: 'old post', postedAt: new Date('2026-11-01T10:00:00Z'), fetchedAt: now })
    await ds.getRepository(Campaign).update(1, { lastDiscovery: { at: now.toISOString(), added: 3, skipped: [], spentMicros: 980_000, stoppedByBudget: true, postsPending: 2 } })
  })

  it('refuses without the go-ahead, with the cost for everyone waiting', async () => {
    await expect(discovery.readPendingPosts(1, { raiseBudget: false }, now)).rejects.toThrow(/2 people.*\$0\.15.*\$0\.02 left of \$1\.00/)
    expect(await ds.getRepository(XPost).count()).toBe(1)
  })

  it('with the go-ahead, reads only the people waiting, raises the budget just enough and clears the waiting count', async () => {
    const r = await discovery.readPendingPosts(1, { raiseBudget: true }, now)
    expect(r).toMatchObject({ people: 2, posts: 3, costMicros: 15_000, spentMicros: 995_000, budgetMicros: 1_130_000 })
    expect(r.prospectIds).toHaveLength(2)
    expect((await ds.getRepository(Campaign).findOneByOrFail({ id: 1 })).lastDiscovery?.postsPending).toBe(0)
  })
})
