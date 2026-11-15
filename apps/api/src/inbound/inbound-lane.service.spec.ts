import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ApiUsage, Campaign, Prospect } from '../discovery/entities'
import { JobsService } from '../jobs/jobs.service'
import { Job } from '../jobs/job.entity'
import { Contact, DoNotContact, Draft, SendAttempt, SenderAccount } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { InboundLaneService } from './inbound-lane.service'

let ds: DataSource
let x: FakeXClient
let service: InboundLaneService
let jobs: JobsService
const POSTED = new Date('2026-11-10T09:00:00Z')

const campaign = (extra: Partial<Campaign> = {}) =>
  ds.getRepository(Campaign).save({ name: 'c', keywords: [], handles: [], callPostUrl: 'https://x.com/fund/status/1', callKeyword: 'build', callPostedAt: POSTED, ...extra })

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  jobs = new JobsService(ds)
  service = new InboundLaneService(ds, x, jobs)
  await ds.getRepository(SenderAccount).save({ id: 1, xUserId: '100', handle: 'fund' })
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('InboundLaneService', () => {
  it('test 20: attaches a keyword DM sent after the call post as a messaged-us prospect and sends nothing', async () => {
    const c = await campaign()
    x.addInboundDm({ senderId: '200', handle: 'mina_builds', text: "Build, I'm working on a multilingual agent", createdAt: new Date('2026-11-11T10:00:00Z') })
    expect(await service.attach(c.id)).toMatchObject({ attached: 1 })
    const p = await ds.getRepository(Prospect).findOneByOrFail({ campaignId: c.id, xUserId: '200' })
    expect([p.relationship, p.source, p.callText]).toEqual(['messaged_us', 'call', "Build, I'm working on a multilingual agent"])
    const contact = await ds.getRepository(Contact).findOneByOrFail({ xUserId: '200' })
    expect([contact.relationshipContext, contact.invitationEventId]).toEqual(['messaged_us', null])
    expect(x.sendCalls).toBe(0)
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
    expect(await ds.getRepository(Draft).count()).toBe(0)
  })

  it('is safe to run again', async () => {
    const c = await campaign()
    x.addInboundDm({ senderId: '200', handle: 'mina_builds', text: 'build', createdAt: new Date('2026-11-11T10:00:00Z') })
    await service.attach(c.id)
    expect(await service.attach(c.id)).toMatchObject({ attached: 0 })
    expect(await ds.getRepository(Prospect).count()).toBe(1)
  })

  it('test 21: ignores a DM sent before the call post and a DM without the keyword', async () => {
    const c = await campaign()
    x.addInboundDm({ senderId: '200', handle: 'early', text: 'build', createdAt: new Date('2026-11-09T10:00:00Z') })
    x.addInboundDm({ senderId: '201', handle: 'other', text: 'I will rebuild my site', createdAt: new Date('2026-11-11T10:00:00Z') })
    expect(await service.attach(c.id)).toMatchObject({ attached: 0 })
    expect(await ds.getRepository(Prospect).count()).toBe(0)
  })

  it('test 21: a person on Do not contact is not attached', async () => {
    const c = await campaign()
    await ds.getRepository(DoNotContact).save({ xUserId: '200', reason: 'asked to stop', source: 'reply' })
    x.addInboundDm({ senderId: '200', handle: 'stopper', text: 'build', createdAt: new Date('2026-11-11T10:00:00Z') })
    expect(await service.attach(c.id)).toMatchObject({ attached: 0 })
    expect(await ds.getRepository(Prospect).count()).toBe(0)
  })

  it('does not read DMs for a campaign without a call post', async () => {
    const c = await campaign({ callPostUrl: null, callKeyword: null, callPostedAt: null })
    expect(await service.attach(c.id)).toMatchObject({ attached: 0 })
    expect(x.inboundReads).toBe(0)
  })

  it('turns an existing prospect into a call prospect', async () => {
    const c = await campaign()
    await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '200' })
    x.addInboundDm({ senderId: '200', handle: 'mina_builds', text: 'build', createdAt: new Date('2026-11-11T10:00:00Z') })
    await service.attach(c.id)
    const p = await ds.getRepository(Prospect).findOneByOrFail({ campaignId: c.id, xUserId: '200' })
    expect([p.relationship, p.callEventId === null]).toEqual(['messaged_us', false])
  })

  it('counts the events it read as dm_event usage, at most 10 per check', async () => {
    const c = await campaign()
    for (let i = 0; i < 12; i++) x.addInboundDm({ senderId: `3${i}`, handle: `h${i}`, text: 'build', createdAt: new Date(`2026-11-11T10:${10 + i}:00Z`) })
    expect(await service.attach(c.id)).toEqual({ attached: 10, read: 10 })
    const usage = await ds.getRepository(ApiUsage).findBy({ campaignId: c.id })
    expect(usage.map((u) => [u.kind, u.count, u.costMicros])).toEqual([['dm_event', 10, 100_000]])
  })

  it('records no usage when nothing was read', async () => {
    const c = await campaign({ callPostUrl: null, callKeyword: null, callPostedAt: null })
    await service.attach(c.id)
    expect(await ds.getRepository(ApiUsage).count()).toBe(0)
  })
})

describe('InboundLaneService.confirmInvitation', () => {
  const attached = async () => {
    const c = await campaign()
    x.addInboundDm({ senderId: '200', handle: 'mina_builds', text: 'build', createdAt: new Date('2026-11-11T10:00:00Z') })
    await service.attach(c.id)
    const p = await ds.getRepository(Prospect).findOneByOrFail({ campaignId: c.id, xUserId: '200' })
    return { c, p }
  }

  it('fills the invitation from the stored call DM and sends nothing', async () => {
    const { c, p } = await attached()
    await service.confirmInvitation(c.id, p.id)
    const contact = await ds.getRepository(Contact).findOneByOrFail({ xUserId: '200' })
    expect([contact.recipientPermission, contact.invitationEventId, contact.invitationAt]).toEqual(['requested_dm', p.callEventId, new Date('2026-11-11T10:00:00Z')])
    expect(x.sendCalls).toBe(0)
    expect(await ds.getRepository(SendAttempt).count()).toBe(0)
  })

  it('refuses a prospect that did not come from the call post', async () => {
    const c = await campaign()
    const p = await ds.getRepository(Prospect).save({ campaignId: c.id, xUserId: '200' })
    await expect(service.confirmInvitation(c.id, p.id)).rejects.toThrow('did not answer the call post')
  })

  it('refuses a person on Do not contact', async () => {
    const { c, p } = await attached()
    await ds.getRepository(DoNotContact).save({ xUserId: '200', reason: 'asked to stop', source: 'reply' })
    await expect(service.confirmInvitation(c.id, p.id)).rejects.toThrow('Do not contact')
    expect((await ds.getRepository(Contact).findOneByOrFail({ xUserId: '200' })).invitationEventId).toBeNull()
  })

  it('answers not found for a prospect of another campaign', async () => {
    const { p } = await attached()
    await expect(service.confirmInvitation(p.campaignId + 1, p.id)).rejects.toThrow('Prospect not found')
  })
})

describe('InboundLaneService.scheduleChecks', () => {
  const MIN = 60_000
  const open = (campaignId: number) => ds.getRepository(Job).findBy({ type: 'inbound_check' }).then((all) => all.filter((j) => j.payload.campaignId === campaignId))

  it('queues one check per campaign with a call post, every 30 minutes', async () => {
    const withCall = await campaign()
    const without = await campaign({ callPostUrl: null, callKeyword: null, callPostedAt: null })
    const t0 = new Date('2026-11-12T08:00:00Z')
    await service.scheduleChecks(t0)
    expect((await open(withCall.id)).length).toBe(1)
    expect((await open(without.id)).length).toBe(0)

    await service.scheduleChecks(new Date(t0.getTime() + 10 * MIN))
    expect((await open(withCall.id)).length).toBe(1)

    await ds.getRepository(Job).update({ type: 'inbound_check' }, { status: 'done' })
    await service.scheduleChecks(new Date(t0.getTime() + 20 * MIN))
    expect((await open(withCall.id)).length).toBe(1)
    await service.scheduleChecks(new Date(t0.getTime() + 31 * MIN))
    expect((await open(withCall.id)).length).toBe(2)
  })

  it('does not queue a second check while one is still open', async () => {
    const c = await campaign()
    await service.scheduleChecks(new Date('2026-11-12T08:00:00Z'))
    await service.scheduleChecks(new Date('2026-11-12T09:00:00Z'))
    expect((await open(c.id)).length).toBe(1)
  })

  it('skips a campaign when no sender is connected', async () => {
    await ds.getRepository(SenderAccount).clear()
    const c = await campaign()
    await service.scheduleChecks(new Date('2026-11-12T08:00:00Z'))
    expect((await open(c.id)).length).toBe(0)
  })
})
