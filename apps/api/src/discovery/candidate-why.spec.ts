import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Claim, Evidence } from '../fit/entities'
import { XUser } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { leadReason } from './candidate-why'
import { Campaign, Prospect, XPost } from './entities'
import { ProspectsService } from './prospects.service'

const claim = (side: 'for' | 'against' | 'unknown', text: string, status: 'verified' | 'inferred' | 'unsure' = 'verified') => ({ side, text, status, evidence: [] })

describe('lead reason for a Fit label', () => {
  it('takes the best reason for a Strong or Possible label, a post-backed one first', () => {
    const claims = [claim('for', 'Guess about funding', 'inferred'), claim('for', 'Shipped an agent tool'), claim('against', 'Small following')]
    expect(leadReason('possible', claims)).toMatchObject({ text: 'Shipped an agent tool', side: 'for', status: 'verified' })
    expect(leadReason('strong', claims)?.text).toBe('Shipped an agent tool')
  })

  it('takes the main reason against for Weak or Not a fit, and falls back to any reason', () => {
    const claims = [claim('for', 'Posts about AI'), claim('against', 'Invests in startups, does not build', 'unsure'), claim('against', 'Writes about markets')]
    expect(leadReason('not_a_fit', claims)?.text).toBe('Writes about markets')
    expect(leadReason('weak', [claim('for', 'Posts about AI', 'inferred')])?.text).toBe('Posts about AI')
  })

  it('has nothing to say before scoring or without reasons', () => {
    expect(leadReason(null, [claim('for', 'x')])).toBeNull()
    expect(leadReason('possible', [claim('unknown', 'Current funding', 'inferred')])).toBeNull()
  })
})

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

async function person(id: string, over: Partial<Prospect>, posts = 0) {
  await ds.getRepository(XUser).save({ xUserId: id, handle: `u${id}`, name: `User ${id}`, bio: 'ai builder', followers: 5 })
  for (let i = 0; i < posts; i++) await ds.getRepository(XPost).save({ postId: `${id}0${i}`, xUserId: id, text: `post ${i}`, postedAt: daysAgo(i + 1), fetchedAt: now })
  return ds.getRepository(Prospect).save({ campaignId: 1, xUserId: id, ...over })
}

describe('why there is no opening', () => {
  it('tells apart posts never read, no recent specific post, and an opening over 90 days old', async () => {
    await person('1', { fit: 'possible' }, 0)
    await person('2', { fit: 'possible', openingType: 'none' }, 3)
    await person('3', { fit: 'strong', openingType: 'launch', openingSummary: 'old launch', openingDate: daysAgo(120) }, 3)
    await person('4', { fit: 'strong', openingType: 'launch', openingSummary: 'new launch', openingDate: daysAgo(3) }, 3)
    await person('5', {}, 0)
    const rows = new Map((await new ProspectsService(ds).list(1, now)).map((r) => [r.handle, r]))
    expect(rows.get('u1')?.noOpening).toEqual({ cause: 'posts_not_read', date: null })
    expect(rows.get('u2')?.noOpening).toEqual({ cause: 'no_recent_post', date: null })
    expect(rows.get('u3')?.noOpening).toEqual({ cause: 'expired', date: daysAgo(120) })
    expect(rows.get('u4')?.noOpening).toBeNull()
    expect(rows.get('u5')?.noOpening).toBeNull()
  })

  it('gives each row the lead reason for its label', async () => {
    const p = await person('1', { fit: 'possible' }, 1)
    await ds.getRepository(Claim).save({ prospectId: p.id, side: 'for', text: 'Ships robots', evidenceIds: [], status: 'inferred' })
    const [row] = await new ProspectsService(ds).list(1, now)
    expect(row.why).toMatchObject({ text: 'Ships robots', side: 'for', status: 'inferred' })
  })
})

describe('candidate detail', () => {
  it('adds the posts that were read, newest first, marking the opening and the posts a reason cites', async () => {
    const p = await person('1', { fit: 'possible', openingType: 'launch', openingSummary: 'launch', openingEvidenceId: 'post:100', openingDate: daysAgo(1) }, 3)
    await ds.getRepository(Evidence).save({ id: 'post:101', xUserId: '1', kind: 'post', url: 'https://x.com/u1/status/101', excerpt: 'post 1', postedAt: daysAgo(2), fetchedAt: now })
    await ds.getRepository(Claim).save({ prospectId: p.id, side: 'for', text: 'Builds things', evidenceIds: ['post:101'], status: 'verified' })
    const detail = await new ProspectsService(ds).detail(1, p.id, now)
    expect(detail.posts.map((x) => [x.id, x.opening, x.cited])).toEqual([
      ['100', true, false],
      ['101', false, true],
      ['102', false, false],
    ])
    expect(detail.posts[0]).toMatchObject({ text: 'post 0', url: 'https://x.com/u1/status/100' })
    expect(detail.claims[0].evidence[0]).toMatchObject({ id: 'post:101', excerpt: 'post 1' })
  })

  it('is not found for a person of another campaign', async () => {
    const p = await person('1', { fit: 'possible' })
    await expect(new ProspectsService(ds).detail(2, p.id, now)).rejects.toThrow(/not found/i)
  })
})
