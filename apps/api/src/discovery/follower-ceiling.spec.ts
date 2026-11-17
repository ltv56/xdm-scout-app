import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { DiscoveryService } from './discovery.service'
import { Campaign } from './entities'

let ds: DataSource
let discovery: DiscoveryService
const now = new Date('2026-11-17T10:00:00Z')

beforeEach(async () => {
  ds = await createTestDataSource()
  const x = new FakeXClient()
  discovery = new DiscoveryService(ds, x)
  x.addProfile({ id: 's1', handle: 'hub', name: 'Hub', bio: 'robotics hub', followers: 1000 })
  x.addProfile({ id: 'id-small', handle: 'small', name: 'Small', bio: 'robotics founder', followers: 900 })
  x.addProfile({ id: 'id-star', handle: 'star', name: 'Star', bio: 'robotics founder', followers: 2_000_000 })
  x.addFollowing('s1', ['small', 'star'])
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const campaign = (extra: Partial<Campaign>) => ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics'], handles: [], budgetMicros: 5_000_000, ...extra })

describe('follower ceiling', () => {
  it('is 50,000 for a new campaign', async () => {
    expect(await campaign({ seeds: ['hub'] })).toMatchObject({ followersMax: 50_000 })
  })

  it('leaves out people found through seeds who have more followers than the campaign allows, and says why', async () => {
    const c = await campaign({ seeds: ['hub'], followersMax: 1000 })
    const result = await discovery.run(c.id, now)
    expect(result.addedHandles).toEqual(['small'])
    expect(result.skipped).toContainEqual({ handle: 'star', reason: 'too-many-followers' })
  })

  it('keeps a person named by handle, however many followers they have', async () => {
    const c = await campaign({ handles: ['star'], followersMax: 1000 })
    const result = await discovery.run(c.id, now)
    expect(result.addedHandles).toEqual(['star'])
  })
})
