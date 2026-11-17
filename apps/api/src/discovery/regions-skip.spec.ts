import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { DiscoveryService } from './discovery.service'
import { Campaign } from './entities'

let ds: DataSource
let discovery: DiscoveryService
const now = new Date('2026-11-20T10:00:00Z')

beforeEach(async () => {
  ds = await createTestDataSource()
  const x = new FakeXClient()
  discovery = new DiscoveryService(ds, x)
  x.addProfile({ id: 's1', handle: 'hub', bio: 'robotics hub' })
  x.addProfile({ id: '1', handle: 'sg', bio: 'robotics founder', location: 'Singapore' })
  x.addProfile({ id: '2', handle: 'berlin', bio: 'robotics founder', location: 'Berlin, Germany' })
  x.addProfile({ id: '3', handle: 'nowhere', bio: 'robotics founder', location: null })
  x.addFollowing('s1', ['sg', 'berlin', 'nowhere'])
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const campaign = (extra: Partial<Campaign>) => ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics'], handles: [], seeds: ['hub'], budgetMicros: 5_000_000, ...extra })

describe('regions', () => {
  it('leaves out people whose X location names a place outside the regions, before their posts are read', async () => {
    const c = await campaign({ regions: ['Singapore', 'Vietnam'] })
    const result = await discovery.run(c.id, now)
    expect(result.addedHandles!.sort()).toEqual(['nowhere', 'sg'])
    expect(result.skipped).toContainEqual({ handle: 'berlin', reason: 'outside-regions' })
  })

  it('keeps everyone when the campaign has no regions', async () => {
    const result = await discovery.run((await campaign({ regions: null })).id, now)
    expect(result.addedHandles).toHaveLength(3)
  })
})
