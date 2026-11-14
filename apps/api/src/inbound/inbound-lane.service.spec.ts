import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Campaign, Prospect } from '../discovery/entities'
import { Contact, DoNotContact, Draft, SendAttempt, SenderAccount } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { InboundLaneService } from './inbound-lane.service'

let ds: DataSource
let x: FakeXClient
let service: InboundLaneService
const POSTED = new Date('2026-11-10T09:00:00Z')

const campaign = (extra: Partial<Campaign> = {}) =>
  ds.getRepository(Campaign).save({ name: 'c', keywords: [], handles: [], callPostUrl: 'https://x.com/fund/status/1', callKeyword: 'build', callPostedAt: POSTED, ...extra })

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  service = new InboundLaneService(ds, x)
  await ds.getRepository(SenderAccount).save({ id: 1, xUserId: '100', handle: 'fund' })
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('InboundLaneService', () => {
  it('test 20: attaches a keyword DM sent after the call post as a messaged-us prospect and sends nothing', async () => {
    const c = await campaign()
    x.addInboundDm({ senderId: '200', handle: 'mina_builds', text: "Build, I'm working on a multilingual agent", createdAt: new Date('2026-11-11T10:00:00Z') })
    expect(await service.attach(c.id)).toEqual({ attached: 1 })
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
    expect(await service.attach(c.id)).toEqual({ attached: 0 })
    expect(await ds.getRepository(Prospect).count()).toBe(1)
  })

  it('test 21: ignores a DM sent before the call post and a DM without the keyword', async () => {
    const c = await campaign()
    x.addInboundDm({ senderId: '200', handle: 'early', text: 'build', createdAt: new Date('2026-11-09T10:00:00Z') })
    x.addInboundDm({ senderId: '201', handle: 'other', text: 'I will rebuild my site', createdAt: new Date('2026-11-11T10:00:00Z') })
    expect(await service.attach(c.id)).toEqual({ attached: 0 })
    expect(await ds.getRepository(Prospect).count()).toBe(0)
  })

  it('test 21: a person on Do not contact is not attached', async () => {
    const c = await campaign()
    await ds.getRepository(DoNotContact).save({ xUserId: '200', reason: 'asked to stop', source: 'reply' })
    x.addInboundDm({ senderId: '200', handle: 'stopper', text: 'build', createdAt: new Date('2026-11-11T10:00:00Z') })
    expect(await service.attach(c.id)).toEqual({ attached: 0 })
    expect(await ds.getRepository(Prospect).count()).toBe(0)
  })

  it('does not read DMs for a campaign without a call post', async () => {
    const c = await campaign({ callPostUrl: null, callKeyword: null, callPostedAt: null })
    expect(await service.attach(c.id)).toEqual({ attached: 0 })
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
})
