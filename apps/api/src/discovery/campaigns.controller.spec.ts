import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Job } from '../jobs/job.entity'
import { JobsService } from '../jobs/jobs.service'
import { Setting } from '../setting.entity'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { CampaignsController } from './campaigns.controller'
import { DiscoveryService } from './discovery.service'
import { Prospect } from './entities'
import { ProspectsService } from './prospects.service'

let ds: DataSource
let controller: CampaignsController

beforeEach(async () => {
  ds = await createTestDataSource()
  controller = new CampaignsController(ds, new JobsService(ds), new DiscoveryService(ds, new FakeXClient()), new ProspectsService(ds))
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('campaigns API', () => {
  it('answers 404 for a campaign that does not exist', async () => {
    await expect(controller.discover(999)).rejects.toBeInstanceOf(NotFoundException)
    await expect(controller.estimate(999)).rejects.toBeInstanceOf(NotFoundException)
    await expect(controller.get(999)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('does not queue a second discovery while one is pending or running', async () => {
    const campaign = await controller.create({ name: 'c', keywords: ['ai'], handles: ['alice'] })
    expect(await controller.discover(campaign.id)).toEqual({ queued: true })
    expect(await controller.discover(campaign.id)).toEqual({ queued: false, reason: 'Discovery is already running for this campaign' })
    expect(await ds.getRepository(Job).countBy({ type: 'discover' })).toBe(1)
  })

  it('says whether a discovery is pending or running for the campaign', async () => {
    const campaign = await controller.create({ name: 'c', keywords: ['ai'], handles: ['alice'] })
    const other = await controller.create({ name: 'o', keywords: ['ai'], handles: ['bob'] })
    expect((await controller.get(campaign.id)).searching).toBe(false)
    await controller.discover(campaign.id)
    expect((await controller.get(campaign.id)).searching).toBe(true)
    expect((await controller.get(other.id)).searching).toBe(false)
    await ds.getRepository(Job).update({ type: 'discover' }, { status: 'done' })
    expect((await controller.get(campaign.id)).searching).toBe(false)
  })

  it('scores one candidate on request and does not queue the same one twice', async () => {
    const c = await controller.create({ name: 'c', keywords: ['ai'], handles: ['alice'] })
    const p = await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '500' })
    expect(await controller.scoreOne(c.id, p.id)).toEqual({ queued: true })
    expect(await controller.scoreOne(c.id, p.id)).toEqual({ queued: false, reason: 'Already being scored' })
    expect(await ds.getRepository(Job).countBy({ type: 'score' })).toBe(1)

    await ds.getRepository(Job).update({ type: 'score' }, { status: 'done' })
    await ds.getRepository(Prospect).update(p.id, { scoredAt: new Date() })
    expect(await controller.scoreOne(c.id, p.id)).toEqual({ queued: false, reason: 'Already scored' })
    await expect(controller.scoreOne(c.id + 1, p.id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('score all leaves out anyone who is already being scored', async () => {
    const c = await controller.create({ name: 'c', keywords: ['ai'], handles: ['alice'] })
    const first = await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '500' })
    await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '501' })
    await controller.scoreOne(c.id, first.id)
    expect(await controller.score(c.id)).toEqual({ queued: 1 })
    expect(await controller.score(c.id)).toEqual({ queued: 0 })
    expect(await ds.getRepository(Job).countBy({ type: 'score' })).toBe(2)
  })

  it('lists whether each candidate is being scored', async () => {
    const c = await controller.create({ name: 'c', keywords: ['ai'], handles: ['alice'] })
    const queued = await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '500' })
    const idle = await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '501' })
    await controller.scoreOne(c.id, queued.id)
    const rows = await controller.list(c.id)
    expect(rows.find((r) => r.id === queued.id)?.scoring).toBe(true)
    expect(rows.find((r) => r.id === idle.id)?.scoring).toBe(false)
  })

  it('lists campaigns, newest first, with id and name only', async () => {
    const a = await controller.create({ name: 'a', keywords: ['ai'], handles: ['alice'] })
    const b = await controller.create({ name: 'b', keywords: ['ai'], handles: ['bob'] })
    expect(await controller.listCampaigns()).toEqual([
      { id: b.id, name: 'b' },
      { id: a.id, name: 'a' },
    ])
  })

  it('returns the campaign with its last discovery run', async () => {
    const campaign = await controller.create({ name: 'c', keywords: ['ai'], handles: ['alice'] })
    expect(await controller.get(campaign.id)).toMatchObject({ id: campaign.id, name: 'c', lastDiscovery: null })
  })
})

describe('program and call post', () => {
  const profile = { intro: 'We back founders.', programs: [{ id: 3, name: 'Intro to investors', description: 'Intro to investors', link: 'https://genaifund.ai/', deadline: null }], signer: 'Vinh', sampleMessages: [] }
  const base = { name: 'c', keywords: ['ai'], handles: ['alice'] }
  const post = (at: string) => `https://x.com/genaifund_ai/status/${BigInt(Date.parse(at) - 1288834974657) << 22n}`

  beforeEach(async () => {
    await ds.getRepository(Setting).save({ key: 'sender_profile', value: profile })
  })

  it('keeps the program and the call post, and reads the posting time off the post id', async () => {
    const c = await controller.create({ ...base, programId: 3, callPostUrl: post('2026-11-01T03:00:00Z'), callKeyword: ' build ' })
    expect(await controller.get(c.id)).toMatchObject({ programId: 3, callKeyword: 'build', callPostedAt: new Date('2026-11-01T03:00:00Z') })
  })

  it('starts with no program and no call post', async () => {
    const c = await controller.create(base)
    expect(await controller.get(c.id)).toMatchObject({ programId: null, callPostUrl: null, callKeyword: null, callPostedAt: null })
  })

  it('updates them, and clears the call post when both fields are null', async () => {
    const c = await controller.create(base)
    const url = post('2026-11-01T03:00:00Z')
    await controller.update(c.id, { programId: 3, callPostUrl: url, callKeyword: 'build' })
    expect(await controller.get(c.id)).toMatchObject({ programId: 3, callPostUrl: url })
    await controller.update(c.id, { programId: 3, callPostUrl: null, callKeyword: null })
    expect(await controller.get(c.id)).toMatchObject({ callPostUrl: null, callKeyword: null, callPostedAt: null })
  })

  it('rejects a half-filled or wrong call post, a program that is not in the profile and unknown keys', async () => {
    const url = post('2026-11-01T03:00:00Z')
    const bad = [
      { programId: 3, callPostUrl: url },
      { programId: 3, callKeyword: 'build' },
      { programId: 3, callPostUrl: 'https://example.com/post/1', callKeyword: 'build' },
      { programId: 3, callPostUrl: post('2099-01-01T00:00:00Z'), callKeyword: 'build' },
      { programId: 99 },
      { programId: 3, callKeyword: 'x'.repeat(41), callPostUrl: url },
      { surprise: true },
    ]
    for (const extra of bad) await expect(controller.create({ ...base, ...extra })).rejects.toBeInstanceOf(BadRequestException)
    const c = await controller.create(base)
    await expect(controller.update(c.id, { programId: 3, callPostUrl: url, callKeyword: null })).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.update(999, { programId: null, callPostUrl: null, callKeyword: null })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('with CALL_POST=off refuses to set a call post, but still takes a program and clearing it', async () => {
    const off = new CampaignsController(ds, new JobsService(ds), new DiscoveryService(ds, new FakeXClient()), new ProspectsService(ds), { callPost: false })
    const url = post('2026-11-01T03:00:00Z')
    const refused = await off.create({ ...base, callPostUrl: url, callKeyword: 'build' }).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(BadRequestException)
    expect((refused as BadRequestException).message).toBe('Call posts are turned off on this server.')
    const c = await off.create({ ...base, programId: 3 })
    await expect(off.update(c.id, { callPostUrl: url, callKeyword: 'build' })).rejects.toBeInstanceOf(BadRequestException)
    expect(await off.update(c.id, { programId: 3, callPostUrl: null, callKeyword: null })).toMatchObject({ programId: 3, callPostUrl: null })
  })
})

describe('editing a campaign', () => {
  const profile = { intro: 'We back founders.', programs: [{ id: 3, name: 'Intro to investors', description: 'Intro to investors', link: 'https://genaifund.ai/', deadline: null }], signer: 'Vinh', sampleMessages: [] }
  const post = `https://x.com/genaifund_ai/status/${BigInt(Date.parse('2026-11-01T03:00:00Z') - 1288834974657) << 22n}`
  const base = { name: 'c', keywords: ['ai'], handles: ['alice'] }

  beforeEach(async () => {
    await ds.getRepository(Setting).save({ key: 'sender_profile', value: profile })
  })

  it('changes every field it is given', async () => {
    const c = await controller.create(base)
    await controller.update(c.id, {
      name: 'robotics',
      keywords: ['robots', 'agents'],
      handles: ['bob'],
      seeds: ['carol'],
      queries: ['robotics founder'],
      criteria: ['Based in Southeast Asia'],
      budgetUsd: 2.5,
    })
    expect(await controller.get(c.id)).toMatchObject({
      name: 'robotics',
      keywords: ['robots', 'agents'],
      handles: ['bob'],
      seeds: ['carol'],
      queries: ['robotics founder'],
      criteria: ['Based in Southeast Asia'],
      budgetMicros: 2_500_000,
    })
  })

  it('keeps what it is not given, including the program and the call post', async () => {
    const c = await controller.create({ ...base, programId: 3, callPostUrl: post, callKeyword: 'build' })
    await controller.update(c.id, { name: 'renamed' })
    expect(await controller.get(c.id)).toMatchObject({ name: 'renamed', keywords: ['ai'], handles: ['alice'], programId: 3, callPostUrl: post, callKeyword: 'build' })
  })

  it('a program and call post change leaves the search fields alone', async () => {
    const c = await controller.create(base)
    await controller.update(c.id, { programId: 3, callPostUrl: post, callKeyword: 'build' })
    expect(await controller.get(c.id)).toMatchObject({ keywords: ['ai'], handles: ['alice'], programId: 3, callKeyword: 'build' })
  })

  it('stores handles and seeds without @, in lower case and without repeats, on create and on edit', async () => {
    const c = await controller.create({ ...base, handles: ['@Alice', 'alice', 'Bob'], seeds: ['@Carol'] })
    expect(await controller.get(c.id)).toMatchObject({ handles: ['alice', 'bob'], seeds: ['carol'] })
    await controller.update(c.id, { handles: ['@Dave', 'DAVE'], seeds: [] })
    expect(await controller.get(c.id)).toMatchObject({ handles: ['dave'], seeds: [] })
  })

  it('refuses what create refuses', async () => {
    const c = await controller.create({ ...base, queries: ['ai'] })
    const bad = [
      { keywords: [] },
      { handles: [], queries: [] },
      { seeds: Array.from({ length: 11 }, (_, i) => `s${i}`) },
      { queries: Array.from({ length: 11 }, (_, i) => `q${i}`) },
      { criteria: Array.from({ length: 6 }, (_, i) => `c${i}`) },
      { criteria: ['x'.repeat(201)] },
      { name: '' },
      { budgetUsd: 0 },
      { budgetUsd: 101 },
      { surprise: true },
    ]
    for (const extra of bad) await expect(controller.update(c.id, extra)).rejects.toBeInstanceOf(BadRequestException)
    expect(await controller.get(c.id)).toMatchObject({ name: 'c', keywords: ['ai'], handles: ['alice'] })
  })

  it('says why in the same words as create', async () => {
    const c = await controller.create(base)
    await expect(controller.update(c.id, { handles: [] })).rejects.toThrow('Give at least one handle, seed account or search query')
  })

  it('does not touch the people already found', async () => {
    const c = await controller.create(base)
    await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '500' })
    await controller.update(c.id, { keywords: ['other'], handles: ['zed'] })
    expect(await ds.getRepository(Prospect).countBy({ campaignId: c.id })).toBe(1)
  })

  it('answers 404 for a campaign that does not exist', async () => {
    await expect(controller.update(999, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('read limits', () => {
  const base = { name: 'c', keywords: ['ai'], handles: ['alice'] }

  it('keeps posts per search between 10 and 50 and people per seed between 10 and 200', async () => {
    for (const bad of [{ searchMax: 5 }, { searchMax: 60 }, { followingMax: 9 }, { followingMax: 201 }, { searchMax: 12.5 }]) {
      await expect(controller.create({ ...base, ...bad })).rejects.toBeInstanceOf(BadRequestException)
    }
    const c = await controller.create({ ...base, searchMax: 30, followingMax: 50 })
    expect(await controller.get(c.id)).toMatchObject({ searchMax: 30, followingMax: 50 })
    await controller.update(c.id, { followingMax: 150 })
    expect(await controller.get(c.id)).toMatchObject({ searchMax: 30, followingMax: 150 })
    await expect(controller.update(c.id, { searchMax: 51 })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('keeps the follower ceiling between 1,000 and 10,000,000 and shows it back', async () => {
    for (const bad of [{ followersMax: 999 }, { followersMax: 10_000_001 }, { followersMax: 1500.5 }]) {
      await expect(controller.create({ ...base, ...bad })).rejects.toBeInstanceOf(BadRequestException)
    }
    const c = await controller.create({ ...base, followersMax: 20_000 })
    expect(await controller.get(c.id)).toMatchObject({ followersMax: 20_000 })
    await controller.update(c.id, { followersMax: 80_000 })
    expect(await controller.get(c.id)).toMatchObject({ followersMax: 80_000 })
    await expect(controller.update(c.id, { followersMax: 5 })).rejects.toBeInstanceOf(BadRequestException)
  })
})
