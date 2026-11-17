import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { DiscoveryService } from './discovery.service'
import { Campaign } from './entities'

let ds: DataSource
let x: FakeXClient
let discovery: DiscoveryService
const now = new Date('2026-11-17T10:00:00Z')

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  discovery = new DiscoveryService(ds, x)
  x.addProfile({ id: 's1', handle: 'hub', name: 'Hub', bio: 'robotics hub', followers: 1000 })
  for (const h of ['alice', 'bob', 'cara']) x.addProfile({ id: `id-${h}`, handle: h, name: h, bio: 'robotics founder', followers: 10 })
  x.addFollowing('s1', ['alice', 'bob', 'cara'])
  x.addSearch('robotics', ['alice'])
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const campaign = (extra: Partial<Campaign>) => ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics'], handles: [], budgetMicros: 5_000_000, ...extra })

describe('per-campaign read limits', () => {
  it('a new campaign reads at most 20 posts per search and 100 people per seed', async () => {
    const c = await campaign({ queries: ['robotics'], seeds: ['hub'] })
    expect(c).toMatchObject({ searchMax: 20, followingMax: 100 })
  })

  it('asks X for no more search results than the campaign allows', async () => {
    const c = await campaign({ queries: ['robotics'], searchMax: 10 })
    await discovery.run(c.id, now)
    expect(x.searchCalls).toEqual([{ query: 'robotics', max: 10 }])
  })

  it('reads no more of a seed’s following than the campaign allows', async () => {
    const c = await campaign({ seeds: ['hub'], followingMax: 2 })
    const result = await discovery.run(c.id, now)
    expect(result.seeds).toEqual([{ handle: 'hub', following: 2 }])
  })

  it('estimates from those limits: per query 20 posts with their authors, per seed 100 people', async () => {
    const c = await campaign({ queries: ['a', 'b'], seeds: ['hub'] })
    const e = await discovery.estimate(c.id, now)
    expect(e).toMatchObject({ maxSearch: 40, maxFollowing: 100 })
    // 40 x ($0.005 post + $0.01 author) + 100 x $0.01 + 1 seed profile x $0.01
    expect(e.estimatedMicros).toBe(40 * 15_000 + 100 * 10_000 + 10_000)
  })
})
