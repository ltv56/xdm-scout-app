import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DiscoveryService } from '../discovery/discovery.service'
import { ProspectsService } from '../discovery/prospects.service'
import { Campaign, Prospect } from '../discovery/entities'
import { ActivityLog } from '../activity/activity-log.entity'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { KnownListService, parseHandles, splitHandles } from './known-list.service'

let ds: DataSource
let x: FakeXClient
let service: KnownListService

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  service = new KnownListService(ds, x)
  x.addProfile({ id: '1', handle: 'alice', name: 'Alice', bio: 'Building robotics foundation models', followers: 900 })
  x.addProfile({ id: '2', handle: 'bob', name: 'Bob', bio: 'LLM agents and developer tools', followers: 50 })
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('parseHandles', () => {
  it('takes handles from lines or a CSV column, with or without @, once each', () => {
    expect(parseHandles('handle,event\n@Alice,Build Week\nbob, Demo Day\n\n  alice  \n')).toEqual(['alice', 'bob'])
    expect(parseHandles('carol\n@dave\n')).toEqual(['carol', 'dave'])
    expect(parseHandles('')).toEqual([])
    expect(splitHandles('alice\nnot a handle\nway_too_long_for_x_handles').invalid).toEqual(['not a handle', 'way_too_long_for_x_handles'])
  })
})

describe('KnownListService', () => {
  it('imports the handles X knows, and says which it could not find', async () => {
    const res = await service.import('Portfolio', 'handle\n@alice\nbob\nnobody_here\n')
    expect(res).toEqual({ added: 2, alreadyKnown: 0, notFound: ['nobody_here'], invalid: [] })
    expect((await service.list()).map((p) => [p.xUserId, p.handle, p.listName])).toEqual([
      ['1', 'alice', 'Portfolio'],
      ['2', 'bob', 'Portfolio'],
    ])
  })

  it('reports lines that are not handles instead of dropping them silently', async () => {
    const res = await service.import('Portfolio', 'alice\nthis is not a handle\n')
    expect(res).toMatchObject({ added: 1, invalid: ['this is not a handle'] })
  })

  it('a second import keeps the first list name and counts the repeats', async () => {
    await service.import('Portfolio', 'alice')
    const res = await service.import('Build Week', 'alice\nbob')
    expect(res).toEqual({ added: 1, alreadyKnown: 1, notFound: [], invalid: [] })
    expect((await service.list()).map((p) => [p.handle, p.listName])).toEqual([
      ['alice', 'Portfolio'],
      ['bob', 'Build Week'],
    ])
  })

  it('needs a list name and at least one handle', async () => {
    await expect(service.import('  ', 'alice')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.import('Portfolio', '\n \n')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('removes a person, and an unknown one is a 404', async () => {
    await service.import('Portfolio', 'alice')
    await service.remove('1')
    expect(await service.list()).toEqual([])
    await expect(service.remove('1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('Discovery skips people on the list, and finds them again once they are removed', async () => {
    await service.import('Portfolio', 'alice')
    const campaign = await ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics', 'llm'], handles: ['alice', 'bob'] })
    const discovery = new DiscoveryService(ds, x)
    const now = new Date('2026-11-12T10:00:00Z')

    const first = await discovery.run(campaign.id, now)
    expect(first.skipped).toEqual([{ handle: 'alice', reason: 'known-to-fund' }])
    expect((await ds.getRepository(Prospect).find()).map((p) => p.xUserId)).toEqual(['2'])

    await service.remove('1')
    await discovery.run(campaign.id, now)
    expect((await ds.getRepository(Prospect).find({ order: { xUserId: 'ASC' } })).map((p) => p.xUserId)).toEqual(['1', '2'])
  })
})

describe('warm list', () => {
  it('keeps the kind and the event with each person', async () => {
    await service.import('Build Week 2026', 'alice', { kind: 'warm', event: 'Met at Build Week' })
    await service.import('Portfolio', 'bob')
    expect((await service.list()).map((p) => [p.handle, p.kind, p.event])).toEqual([
      ['alice', 'warm', 'Met at Build Week'],
      ['bob', 'known', null],
    ])
  })

  it('Discovery keeps warm people and Candidates says which list they are on', async () => {
    await service.import('Build Week 2026', 'alice', { kind: 'warm', event: 'Met at Build Week' })
    const campaign = await ds.getRepository(Campaign).save({ name: 'c', keywords: ['robotics', 'llm'], handles: ['alice', 'bob'] })
    const run = await new DiscoveryService(ds, x).run(campaign.id, new Date('2026-11-12T10:00:00Z'))
    expect(run.skipped).toEqual([])
    const rows = await new ProspectsService(ds).list(campaign.id, new Date('2026-11-12T10:00:00Z'))
    expect(rows.map((r) => [r.handle, r.fundList])).toEqual([
      ['alice', { name: 'Build Week 2026', kind: 'warm', event: 'Met at Build Week' }],
      ['bob', null],
    ])
  })
})

describe('activity log', () => {
  it('records an import and a removal', async () => {
    await service.import('Portfolio', 'alice\nbob')
    await service.remove('1')
    expect((await ds.getRepository(ActivityLog).find({ order: { id: 'ASC' } })).map((a) => [a.kind, a.subject, a.detail])).toEqual([
      ['known_added', 'Portfolio', 'Added 2 people'],
      ['known_removed', '1', 'Removed alice from Portfolio'],
    ])
  })
})
