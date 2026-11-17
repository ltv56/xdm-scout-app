import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Claim, Evidence } from '../fit/entities'
import { Contact, Draft, SendAttempt, SenderAccount, XUser } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { seedDraft, sha } from '../test/seed'
import { Campaign, Prospect, XPost } from './entities'
import { ProspectsService } from './prospects.service'

let ds: DataSource

const now = new Date('2026-11-12T10:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

beforeEach(async () => {
  ds = await createTestDataSource()
  await ds.getRepository(Campaign).save({ name: 'c', keywords: ['ai'], handles: [] })
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

async function addProspect(id: string, over: Partial<Prospect> = {}, bio = 'ai builder') {
  await ds.getRepository(XUser).save({ xUserId: id, handle: `u${id}`, name: `User ${id}`, bio, followers: 5 })
  return ds.getRepository(Prospect).save({ campaignId: 1, xUserId: id, ...over })
}

describe('prospects list', () => {
  it('orders by Fit, then by how recent the opening is, and puts unscored people last', async () => {
    await addProspect('1', { fit: 'weak', openingDate: daysAgo(1) })
    await addProspect('2', { fit: 'strong', openingDate: daysAgo(20) })
    await addProspect('3')
    await addProspect('4', { fit: 'strong', openingDate: daysAgo(3) })
    await addProspect('5', { fit: 'possible', openingDate: null })

    const list = await new ProspectsService(ds).list(1, now)
    expect(list.map((p) => p.handle)).toEqual(['u4', 'u2', 'u5', 'u1', 'u3'])
  })

  it('within one Fit, lists people who meet the fund criteria before those who do not', async () => {
    const sea = (status: 'met' | 'not_met' | 'unknown') => [{ text: 'Based in or building for Southeast Asia', status, evidenceIds: [] }]
    await addProspect('1', { fit: 'possible', openingDate: daysAgo(1), criteria: sea('not_met') })
    await addProspect('2', { fit: 'possible', openingDate: daysAgo(2), criteria: sea('unknown') })
    await addProspect('3', { fit: 'possible', openingDate: daysAgo(9), criteria: sea('met') })
    await addProspect('4', { fit: 'strong', openingDate: daysAgo(5), criteria: sea('unknown') })

    const list = await new ProspectsService(ds).list(1, now)
    expect(list.map((p) => p.handle)).toEqual(['u4', 'u3', 'u2', 'u1'])
  })

  it('says where a person stands in the Outbox, and nothing for a send that failed or never started', async () => {
    for (const [id, status] of [['1', 'manual_pending'], ['2', 'sent'], ['3', 'failed']] as const) {
      const prospect = await addProspect(id)
      const draft = await seedDraft(ds, id, `Hi ${id}`)
      await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id })
      await ds.getRepository(SendAttempt).save({ contactId: draft.contactId, draftId: draft.id, route: 'manual', status, contentHash: sha(draft.content) })
    }
    await addProspect('4')
    const rows = await new ProspectsService(ds).list(1, now)
    expect(Object.fromEntries(rows.map((r) => [r.handle, r.outbox]))).toEqual({ u1: 'Send in X', u2: 'Sent', u3: null, u4: null })
  })

  it('labels opening freshness and attaches claims with their evidence links', async () => {
    const p = await addProspect('1', {
      fit: 'strong',
      openingType: 'launch',
      openingSummary: 'Shipped v1',
      openingEvidenceId: 'post:7',
      openingDate: daysAgo(45),
    })
    await ds.getRepository(Evidence).save({
      id: 'post:7', xUserId: '1', kind: 'post', url: 'https://x.com/u1/status/7', excerpt: 'Shipped v1', postedAt: daysAgo(45), fetchedAt: now,
    })
    await ds.getRepository(Claim).save({ prospectId: p.id, side: 'for', text: 'Shipped a product', evidenceIds: ['post:7'], status: 'verified' })

    const [row] = await new ProspectsService(ds).list(1, now)
    expect(row.opening).toMatchObject({ type: 'launch', summary: 'Shipped v1', freshness: 'stale', url: 'https://x.com/u1/status/7' })
    expect(row.claims).toEqual([
      { side: 'for', text: 'Shipped a product', status: 'verified', evidence: [{ id: 'post:7', url: 'https://x.com/u1/status/7' }] },
    ])
  })

  it('shows fund criteria and the date of the latest stored post', async () => {
    const criteria = [{ text: 'Based in or building for Southeast Asia', status: 'met' as const, evidenceIds: ['bio:1'] }]
    await addProspect('1', { fit: 'strong', criteria })
    await ds.getRepository(XPost).save([
      { postId: 'a', xUserId: '1', text: '', postedAt: daysAgo(9), fetchedAt: now },
      { postId: 'b', xUserId: '1', text: '', postedAt: daysAgo(2), fetchedAt: now },
    ])
    await addProspect('2')

    const [first, second] = await new ProspectsService(ds).list(1, now)
    expect(first.criteria).toEqual(criteria)
    expect(first.lastPostAt).toEqual(daysAgo(2))
    expect(second.criteria).toEqual([])
    expect(second.lastPostAt).toBeNull()
  })

  it('passes on the website from the X profile', async () => {
    await addProspect('1', { fit: 'strong' })
    await ds.getRepository(XUser).update('1', { website: 'https://acme.ai' })
    const [row] = await new ProspectsService(ds).list(1, now)
    expect(row.website).toBe('https://acme.ai')
  })

  it('warns that identity is not confirmed for parody or fan accounts', async () => {
    await addProspect('1', {}, 'Parody account of an AI researcher')
    await addProspect('2', {}, 'ai builder')
    const list = await new ProspectsService(ds).list(1, now)
    expect(Object.fromEntries(list.map((p) => [p.handle, p.identityWarning]))).toEqual({ u1: true, u2: false })
  })
})

describe('likely lands in', () => {
  const seen = (id: string, receivesYourDm: boolean | null, over: Partial<Prospect> = {}) =>
    addProspect(id, over).then(() => ds.getRepository(XUser).update(id, { receivesYourDm, fetchedAt: now }))

  it('test 19: follower, open stranger, closed DMs and missing data give Inbox, Requests, Can\'t receive and blank', async () => {
    await seen('1', false, { relationship: 'follower' })
    await seen('2', true)
    await seen('3', false)
    await addProspect('4')
    const list = await new ProspectsService(ds).list(1, now)
    expect(list.map((p) => [p.handle, p.landsIn])).toEqual([
      ['u1', 'inbox'],
      ['u2', 'requests'],
      ['u3', 'cant_receive'],
      ['u4', null],
    ])
  })

  it('says nothing when the profile never reported the field', async () => {
    await seen('1', null)
    await seen('2', null, { relationship: 'follower' })
    expect((await new ProspectsService(ds).list(1, now)).map((p) => [p.handle, p.landsIn])).toEqual([
      ['u2', 'inbox'],
      ['u1', null],
    ])
  })

  it('a conversation wins over receives_your_dm', async () => {
    await seen('1', false, { relationship: 'messaged_us' })
    expect((await new ProspectsService(ds).list(1, now))[0].landsIn).toBe('inbox')
  })

  it('sorts by where the message lands before Fit', async () => {
    await seen('1', true, { fit: 'strong' })
    await seen('2', false, { fit: 'weak', relationship: 'follower' })
    expect((await new ProspectsService(ds).list(1, now)).map((p) => p.handle)).toEqual(['u2', 'u1'])
  })

  it('shows the call DM of a call prospect and whether its invitation is confirmed', async () => {
    await ds.getRepository(SenderAccount).save({ id: 1, xUserId: '100', handle: 'fund' })
    const at = daysAgo(2)
    await addProspect('1', { source: 'call', callEventId: 'in-1', callText: 'build', callAt: at })
    await addProspect('2', { source: 'call', callEventId: 'in-2', callText: 'build too', callAt: at })
    await addProspect('3')
    await ds.getRepository(Contact).save({ senderAccountId: 1, xUserId: '1', relationshipContext: 'messaged_us' })
    await ds.getRepository(Contact).save({ senderAccountId: 1, xUserId: '2', relationshipContext: 'messaged_us', recipientPermission: 'requested_dm', invitationEventId: 'in-2', invitationAt: at })

    const byHandle = new Map((await new ProspectsService(ds).list(1, now)).map((p) => [p.handle, p.call]))
    expect(byHandle.get('u1')).toEqual({ text: 'build', at, invitationConfirmed: false })
    expect(byHandle.get('u2')).toEqual({ text: 'build too', at, invitationConfirmed: true })
    expect(byHandle.get('u3')).toBeNull()
  })
})
