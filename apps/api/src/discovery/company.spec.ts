import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { XUser } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { DiscoveryService } from './discovery.service'
import { ApiUsage, Campaign } from './entities'
import { PRICES } from './pricing'

let ds: DataSource
let x: FakeXClient
let discovery: DiscoveryService
const now = new Date('2026-11-17T10:00:00Z')

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  discovery = new DiscoveryService(ds, x)
  x.addProfile({ id: 'p1', handle: 'mina', bio: 'robotics CTO at @AcmeBots', location: 'Hanoi, Vietnam' })
  x.addProfile({ id: 'p2', handle: 'linh', bio: 'robotics, ex @AcmeBots' })
  x.addProfile({ id: 'p3', handle: 'off', bio: 'cooking at @kitchenco' })
  x.addProfile({ id: 'c1', handle: 'AcmeBots', bio: 'Warehouse robots', location: 'Singapore' })
  x.addProfile({ id: 'c2', handle: 'kitchenco', bio: 'Pans' })
  x.addProfile({ id: 's1', handle: 'hub', bio: 'robotics hub' })
  x.addFollowing('s1', ['mina', 'linh', 'off'])
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const campaign = (extra: Partial<Campaign> = {}) =>
  ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics'], handles: [], seeds: ['hub'], budgetMicros: 5_000_000, ...extra })
const profileCost = async (campaignId: number) =>
  (await ds.getRepository(ApiUsage).findBy({ campaignId, kind: 'profile' })).reduce((sum, u) => sum + u.costMicros, 0)

describe('location and the company named in a bio', () => {
  it('keeps the location X gives with the profile, at no extra cost', async () => {
    const c = await campaign()
    await discovery.run(c.id, now)
    expect((await ds.getRepository(XUser).findOneByOrFail({ xUserId: 'p1' })).location).toBe('Hanoi, Vietnam')
  })

  it('reads the company a kept person names in their bio once, even when two people name it, and bills that one profile', async () => {
    const c = await campaign()
    await discovery.run(c.id, now)
    expect(await ds.getRepository(XUser).findOneBy({ xUserId: 'c1' })).toMatchObject({ bio: 'Warehouse robots', location: 'Singapore' })
    expect(await profileCost(c.id)).toBe(2 * PRICES.profile)
  })

  it('does not read a company for someone the search left out', async () => {
    const c = await campaign()
    await discovery.run(c.id, now)
    expect(await ds.getRepository(XUser).findOneBy({ xUserId: 'c2' })).toBeNull()
  })

  it('skips the company read when the budget has no room for it, without calling the search stopped', async () => {
    for (const id of ['p1', 'p2']) x.addPosts(id, Array.from({ length: 15 }, (_, i) => ({ id: `${id}-${i}`, userId: id, text: 'shipped a robot', createdAt: now })))
    // The seed profile, its 3 follows and 15 posts each for the 2 people kept: less than one profile left for the company.
    const c = await campaign({ budgetMicros: PRICES.profile + 3 * PRICES.following + 2 * 15 * PRICES.post + PRICES.profile - 1 })
    const result = await discovery.run(c.id, now)
    expect(await ds.getRepository(XUser).findOneBy({ xUserId: 'c1' })).toBeNull()
    expect(result.stoppedByBudget).toBe(false)
  })
})
