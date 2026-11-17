import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { XUser } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { DiscoveryService } from './discovery.service'
import { ApiUsage, Campaign, Prospect } from './entities'
import { PRICES } from './pricing'

// A new campaign reads up to 100 people per seed (campaigns.followingMax).
const FOLLOWING = 100

let ds: DataSource
let x: FakeXClient
let discovery: DiscoveryService

const now = new Date('2026-11-12T10:00:00Z')

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  discovery = new DiscoveryService(ds, x)
  x.addProfile({ id: 's1', handle: 'seed_a', bio: 'robotics lab' })
  x.addProfile({ id: 's2', handle: 'seed_b', bio: 'AI community' })
  x.addProfile({ id: '1', handle: 'alice', bio: 'Building robotics foundation models' })
  x.addProfile({ id: '2', handle: 'bob', bio: 'LLM agents' })
  x.addProfile({ id: '3', handle: 'chef', bio: 'I cook pasta' })
  x.addProfile({ id: '4', handle: 'corp', bio: 'Robotics platform', orgType: 'business' })
  x.addFollowing('s1', ['alice', 'bob', 'chef'])
  x.addFollowing('s2', ['alice', 'corp'])
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const newCampaign = (seeds: string[], budgetMicros = 5_000_000) =>
  ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics', 'llm'], handles: [], seeds, budgetMicros })

const usage = (kind: string) => ds.getRepository(ApiUsage).findBy({ kind: kind as ApiUsage['kind'] })

describe('discovery from seed accounts', () => {
  it('says how many accounts each seed follows, so a seed that follows nobody is visible', async () => {
    x.addProfile({ id: 's3', handle: 'seed_c', bio: 'robotics' })
    const campaign = await newCampaign(['seed_a', 'seed_c'])

    const result = await discovery.run(campaign.id, now)

    expect(result.seeds).toEqual([
      { handle: 'seed_a', following: 3 },
      { handle: 'seed_c', following: 0 },
    ])
  })

  it('adds people the seeds follow as adjacent, counting how many seeds follow each one', async () => {
    const campaign = await newCampaign(['seed_a', '@Seed_B'])

    const result = await discovery.run(campaign.id, now)

    const prospects = await ds.getRepository(Prospect).find({ order: { xUserId: 'ASC' } })
    expect(prospects.map((p) => [p.xUserId, p.relationship, p.seedCount])).toEqual([
      ['1', 'adjacent', 2],
      ['2', 'adjacent', 1],
    ])
    expect(Object.fromEntries(result.skipped.map((s) => [s.handle, s.reason]))).toEqual({ chef: 'off-topic', corp: 'organization' })
    expect((await usage('following')).map((u) => u.count)).toEqual([3, 2])
    expect(await ds.getRepository(XUser).countBy({ handle: 'chef' })).toBe(1)
  })

  it('reads following only as far as the budget allows', async () => {
    const campaign = await newCampaign(['seed_a', 'seed_b'], 2 * PRICES.profile + 2 * PRICES.following)

    const result = await discovery.run(campaign.id, now)

    expect(result.stoppedByBudget).toBe(true)
    expect((await usage('following')).map((u) => u.count)).toEqual([2])
    const spent = (await ds.getRepository(ApiUsage).find()).reduce((s, u) => s + u.costMicros, 0)
    expect(spent).toBeLessThanOrEqual(campaign.budgetMicros)
  })

  it('includes an upper bound for following reads in the estimate', async () => {
    const campaign = await newCampaign(['seed_a', 'seed_b'])

    const estimate = await discovery.estimate(campaign.id, now)

    expect(estimate.profiles).toBe(2)
    expect(estimate.maxFollowing).toBe(2 * FOLLOWING)
    expect(estimate.estimatedMicros).toBe(2 * PRICES.profile + 2 * FOLLOWING * PRICES.following)
  })

  it('adds the people who follow a followers-of seed, and counts them in the report and the estimate', async () => {
    // alice and bob follow the community account; the community account follows nobody we know.
    x.addProfile({ id: 's4', handle: 'sea_ai_community', bio: 'AI community' })
    x.addFollowing('1', ['sea_ai_community'])
    x.addFollowing('2', ['sea_ai_community'])
    const campaign = await ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics', 'llm'], handles: [], seeds: [], followersOf: ['@sea_ai_community'], budgetMicros: 5_000_000 })

    expect((await discovery.estimate(campaign.id, now)).maxFollowing).toBe(FOLLOWING)
    const result = await discovery.run(campaign.id, now)

    expect(result.seeds).toEqual([{ handle: 'sea_ai_community', following: 2, list: 'followers' }])
    const added = await ds.getRepository(Prospect).findBy({ campaignId: campaign.id })
    expect(added.map((p) => [p.xUserId, p.relationship]).sort()).toEqual([['1', 'adjacent'], ['2', 'adjacent']])
    expect((await usage('following')).reduce((n, u) => n + u.count, 0)).toBe(2)
  })
})
