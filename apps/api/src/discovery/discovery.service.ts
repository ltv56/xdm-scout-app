import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, In, Not } from 'typeorm'
import { KnownUser } from '../known/known-user.entity'
import { Contact, DoNotContact, RelationshipContext, SendAttempt, XUser } from '../sending/entities'
import { X_CLIENT, XClient, XProfile } from '../x/x-client'
import { ApiUsage, Campaign, DiscoveryRun, Prospect, XPost } from './entities'
import { MAX_POSTS_PER_USER, MIN_SEARCH_RESULTS, PRICES } from './pricing'
import { bioHasKeyword, companyHandle } from './keywords'
import { outsideRegions } from './regions'

const FRESH_MS = 7 * 86_400_000

export type SkipReason =
  | 'not-found'
  | 'protected'
  | 'organization'
  | 'do-not-contact'
  | 'known-to-fund'
  | 'already-contacted'
  | 'off-topic'
  | 'too-many-followers'
  | 'outside-regions'
  | 'budget'

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly ds: DataSource,
    @Inject(X_CLIENT) private readonly x: XClient,
  ) {}

  async estimate(campaignId: number, now = new Date()) {
    const campaign = await this.ds.getRepository(Campaign).findOneByOrFail({ id: campaignId })
    const handles = uniqueHandles(campaign.handles)
    const seeds = uniqueHandles(campaign.seeds ?? [])
    const followersOf = uniqueHandles(campaign.followersOf ?? [])
    const known = await this.knownByHandle()
    const profiles = unique([...handles, ...seeds, ...followersOf]).filter((h) => isStale(known.get(h), now)).length
    let needPosts = 0
    for (const h of handles) {
      const user = known.get(h)
      if (!user || !(await this.hasPosts(user.xUserId))) needPosts += 1
    }
    const maxPosts = needPosts * MAX_POSTS_PER_USER
    const maxFollowing = (seeds.length + followersOf.length) * campaign.followingMax
    const maxSearch = (campaign.queries ?? []).length * campaign.searchMax
    return {
      profiles,
      maxPosts,
      maxFollowing,
      maxSearch,
      estimatedMicros:
        profiles * PRICES.profile +
        maxPosts * PRICES.post +
        maxFollowing * PRICES.following +
        maxSearch * (PRICES.post + PRICES.profile),
    }
  }

  async run(campaignId: number, now = new Date()) {
    const campaign = await this.ds.getRepository(Campaign).findOneByOrFail({ id: campaignId })
    const handles = uniqueHandles(campaign.handles)
    const seeds = uniqueHandles(campaign.seeds ?? [])
    const followersOf = uniqueHandles(campaign.followersOf ?? [])
    const startSpent = await this.spent(campaignId)
    let stoppedByBudget = false

    const known = await this.knownByHandle()
    const stale = unique([...handles, ...seeds, ...followersOf]).filter((h) => isStale(known.get(h), now))
    const affordable = Math.max(0, Math.floor((campaign.budgetMicros - startSpent) / PRICES.profile))
    const unaffordable = new Set(stale.slice(affordable))
    const toFetch = stale.slice(0, affordable)
    if (toFetch.length) {
      const profiles = await this.x.lookupUsers(toFetch)
      // A handle X no longer returns is deleted, suspended or renamed: drop its cached profile.
      for (const h of toFetch) known.delete(h)
      for (const p of profiles) known.set(p.handle.toLowerCase(), await this.saveUser(p, now))
      await this.recordUsage(campaignId, 'profile', profiles.length, PRICES.profile)
    }

    const skipped: { handle: string; reason: SkipReason }[] = []
    const candidates = new Map<string, Candidate>()
    for (const handle of unique([...handles, ...seeds, ...followersOf])) {
      if (known.has(handle)) continue
      skipped.push({ handle, reason: unaffordable.has(handle) ? 'budget' : 'not-found' })
      if (unaffordable.has(handle)) stoppedByBudget = true
    }
    for (const handle of handles) {
      const user = known.get(handle)
      if (user) candidates.set(user.xUserId, { handle, user, relationship: 'cold', seedCount: 0 })
    }
    const seedUser = (list: 'following' | 'followers') => (handle: string) => { const u = known.get(handle); return u ? [{ handle, id: u.xUserId, list }] : [] }
    const seedUsers = [...seeds.flatMap(seedUser('following')), ...followersOf.flatMap(seedUser('followers'))]
    const seedIds = new Set(seedUsers.map((u) => u.id))
    const seedReport: NonNullable<DiscoveryRun['seeds']> = []
    if (!(await this.addFromSeeds(campaign, seedUsers, seedIds, candidates, now, seedReport))) stoppedByBudget = true
    if (!(await this.addFromSearch(campaign, seedIds, candidates, now))) stoppedByBudget = true

    // People you named by handle are your choice: the keyword check only sorts what seeds and search bring in.
    const named = new Set(handles.flatMap((h) => known.get(h)?.xUserId ?? []))
    const kept: Candidate[] = []
    for (const c of candidates.values()) {
      const reason = await this.skipReason(c.user, named.has(c.user.xUserId) ? null : campaign)
      if (reason) skipped.push({ handle: c.handle, reason })
      else kept.push(c)
    }
    kept.sort((a, b) => b.seedCount - a.seedCount)
    // People already in the campaign are ignored by the insert and not counted.
    const addedHandles: string[] = []
    for (const c of kept) {
      const res = await this.ds
        .getRepository(Prospect)
        .createQueryBuilder()
        .insert()
        .values({ campaignId, xUserId: c.user.xUserId, relationship: c.relationship, seedCount: c.seedCount })
        .orIgnore()
        .updateEntity(false)
        .execute()
      if ((res.raw as { affectedRows?: number }).affectedRows) addedHandles.push(c.handle)
    }
    const added = kept.map((c) => c.user)

    let postsPending = 0
    for (const user of added) {
      if (await this.hasPosts(user.xUserId)) continue
      const remaining = campaign.budgetMicros - (await this.spent(campaignId))
      if (remaining < MAX_POSTS_PER_USER * PRICES.post) {
        postsPending += 1
        stoppedByBudget = true
        continue
      }
      await this.readPosts(campaignId, user.xUserId, now)
    }

    await this.readCompanies(campaign, added, known, now)

    const result = { added: addedHandles.length, addedHandles, seeds: seedReport, skipped, spentMicros: (await this.spent(campaignId)) - startSpent, stoppedByBudget, postsPending }
    await this.ds.getRepository(Campaign).update(campaignId, { lastDiscovery: { at: now.toISOString(), ...result } })
    return result
  }

  // Upsert: two jobs may fetch the same new profile at the same time.
  private async saveUser(p: XProfile, now: Date) {
    const user = toUser(p, now)
    await this.ds.getRepository(XUser).upsert(user, ['xUserId'])
    return user
  }

  // Returns false when the budget stopped a read.
  // report gets how many accounts each seed follows, so a seed that adds nobody is visible.
  private async addFromSeeds(campaign: Campaign, seedUsers: { handle: string; id: string; list: 'following' | 'followers' }[], seedIds: Set<string>, candidates: Map<string, Candidate>, now: Date, report: NonNullable<DiscoveryRun['seeds']>) {
    let complete = true
    for (const { handle, id: seedId, list } of seedUsers) {
      const max = Math.min(campaign.followingMax, Math.floor((await this.remaining(campaign)) / PRICES.following))
      if (max <= 0) {
        complete = false
        continue
      }
      const following = list === 'followers' ? await this.x.getFollowers(seedId, max) : await this.x.getFollowing(seedId, max)
      report.push(list === 'followers' ? { handle, following: following.length, list } : { handle, following: following.length })
      await this.recordUsage(campaign.id, 'following', following.length, PRICES.following)
      for (const p of following) {
        if (seedIds.has(p.id)) continue
        const user = await this.saveUser(p, now)
        const seen = candidates.get(p.id)
        if (seen) Object.assign(seen, { relationship: 'adjacent', seedCount: seen.seedCount + 1 })
        else candidates.set(p.id, { handle: p.handle, user, relationship: 'adjacent', seedCount: 1 })
      }
    }
    return complete
  }

  // Search bills each post and each author returned.
  private async addFromSearch(campaign: Campaign, seedIds: Set<string>, candidates: Map<string, Candidate>, now: Date) {
    let complete = true
    for (const query of campaign.queries ?? []) {
      const max = Math.min(campaign.searchMax, Math.floor((await this.remaining(campaign)) / (PRICES.post + PRICES.profile)))
      if (max < MIN_SEARCH_RESULTS) {
        complete = false
        continue
      }
      const { posts, authors } = await this.x.searchRecent(query, max)
      await this.recordUsage(campaign.id, 'search', posts.length, PRICES.post)
      await this.recordUsage(campaign.id, 'profile', authors.length, PRICES.profile)
      for (const p of authors) {
        if (seedIds.has(p.id) || candidates.has(p.id)) continue
        const user = await this.saveUser(p, now)
        candidates.set(p.id, { handle: p.handle, user, relationship: 'cold', seedCount: 0 })
      }
    }
    return complete
  }

  // One profile read per company named in a kept person's bio, for the location criteria. Optional, so it never stops the search.
  private async readCompanies(campaign: Campaign, people: XUser[], known: Map<string, XUser>, now: Date) {
    const named = unique(people.flatMap((u) => companyHandle(u.bio ?? '', u.handle) ?? []))
    const toRead = named.filter((h) => isStale(known.get(h), now))
    const affordable = Math.max(0, Math.floor((await this.remaining(campaign)) / PRICES.profile))
    if (!toRead.length || !affordable) return
    const profiles = await this.x.lookupUsers(toRead.slice(0, affordable))
    for (const p of profiles) known.set(p.handle.toLowerCase(), await this.saveUser(p, now))
    await this.recordUsage(campaign.id, 'profile', profiles.length, PRICES.profile)
  }

  private async remaining(campaign: Campaign) {
    return campaign.budgetMicros - (await this.spent(campaign.id))
  }

  private async knownByHandle() {
    const users = await this.ds.getRepository(XUser).find()
    return new Map(users.map((u) => [u.handle.toLowerCase(), u]))
  }

  // One person's recent posts, read on request from Candidates. Past the budget it needs the operator's go-ahead,
  // and then raises the budget only by what one read can cost.
  async readPostsFor(campaignId: number, prospectId: number, opts: { raiseBudget: boolean }, now = new Date()) {
    const prospect = await this.ds.getRepository(Prospect).findOneBy({ id: prospectId, campaignId })
    if (!prospect) throw new NotFoundException('Candidate not found')
    const campaign = await this.ds.getRepository(Campaign).findOneByOrFail({ id: campaignId })
    const need = MAX_POSTS_PER_USER * PRICES.post
    const before = await this.spent(campaignId)
    let budgetMicros = campaign.budgetMicros
    if (campaign.budgetMicros - before < need) {
      if (!opts.raiseBudget) throw new ConflictException(`Reading their posts costs up to ${usd(need, true)}, and the campaign has ${usd(Math.max(0, campaign.budgetMicros - before))} left of ${usd(campaign.budgetMicros)}.`)
      budgetMicros = before + need
      await this.ds.getRepository(Campaign).update(campaignId, { budgetMicros })
    }
    const posts = await this.readPosts(campaignId, prospect.xUserId, now)
    const spentMicros = await this.spent(campaignId)
    return { posts, costMicros: spentMicros - before, spentMicros, budgetMicros }
  }

  // Everyone in the campaign whose posts were never read, in one go. Same budget rule as one person.
  async readPendingPosts(campaignId: number, opts: { raiseBudget: boolean }, now = new Date()) {
    const campaign = await this.ds.getRepository(Campaign).findOneByOrFail({ id: campaignId })
    const prospects = await this.ds.getRepository(Prospect).findBy({ campaignId })
    const waiting = []
    for (const p of prospects) if (!(await this.hasPosts(p.xUserId))) waiting.push(p)
    const need = waiting.length * MAX_POSTS_PER_USER * PRICES.post
    const before = await this.spent(campaignId)
    let budgetMicros = campaign.budgetMicros
    if (campaign.budgetMicros - before < need) {
      if (!opts.raiseBudget) {
        throw new ConflictException(`Reading posts for ${waiting.length} people costs up to ${usd(need, true)}, and the campaign has ${usd(Math.max(0, campaign.budgetMicros - before))} left of ${usd(campaign.budgetMicros)}.`)
      }
      budgetMicros = before + need
      await this.ds.getRepository(Campaign).update(campaignId, { budgetMicros })
    }
    let posts = 0
    for (const p of waiting) posts += await this.readPosts(campaignId, p.xUserId, now)
    if (campaign.lastDiscovery) await this.ds.getRepository(Campaign).update(campaignId, { lastDiscovery: { ...campaign.lastDiscovery, postsPending: 0 } })
    const spentMicros = await this.spent(campaignId)
    return { people: waiting.length, posts, prospectIds: waiting.map((p) => p.id), costMicros: spentMicros - before, spentMicros, budgetMicros }
  }

  private async readPosts(campaignId: number, xUserId: string, now: Date) {
    const posts = await this.x.getRecentPosts(xUserId, MAX_POSTS_PER_USER)
    if (posts.length) {
      await this.ds.getRepository(XPost).save(
        posts.map((p) => ({ postId: p.id, xUserId: p.userId, text: p.text, postedAt: p.createdAt, lang: p.lang ?? null, fetchedAt: now })),
      )
      await this.recordUsage(campaignId, 'post', posts.length, PRICES.post)
    }
    return posts.length
  }

  private hasPosts(xUserId: string) {
    return this.ds.getRepository(XPost).existsBy({ xUserId, text: Not('') })
  }

  private async spent(campaignId: number) {
    const row = await this.ds
      .getRepository(ApiUsage)
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.costMicros), 0)', 's')
      .where('u.campaignId = :campaignId', { campaignId })
      .getRawOne<{ s: string }>()
    return Number(row?.s ?? 0)
  }

  private recordUsage(campaignId: number, kind: ApiUsage['kind'], count: number, unit: number) {
    return this.ds.getRepository(ApiUsage).save({ campaignId, kind, count, costMicros: count * unit })
  }

  // limits null: skip the bio and follower checks (a handle the operator named).
  private async skipReason(user: XUser, limits: Pick<Campaign, 'keywords' | 'followersMax' | 'regions'> | null): Promise<SkipReason | null> {
    if (user.isProtected) return 'protected'
    // X gives the government check to officials as well as offices, so only business marks an organisation.
    if (user.orgType === 'business') return 'organization'
    if (await this.ds.getRepository(DoNotContact).existsBy({ xUserId: user.xUserId })) return 'do-not-contact'
    if (await this.ds.getRepository(KnownUser).existsBy({ xUserId: user.xUserId, kind: 'known' })) return 'known-to-fund'
    if (await this.wasContacted(user.xUserId)) return 'already-contacted'
    if (limits && !bioHasKeyword(user.bio ?? '', limits.keywords)) return 'off-topic'
    if (limits && (user.followers ?? 0) > limits.followersMax) return 'too-many-followers'
    if (limits && outsideRegions(user.location, limits.regions ?? [])) return 'outside-regions'
    return null
  }

  private async wasContacted(xUserId: string) {
    const contacts = await this.ds.getRepository(Contact).findBy({ xUserId })
    if (!contacts.length) return false
    return this.ds.getRepository(SendAttempt).existsBy({
      contactId: In(contacts.map((c) => c.id)),
      status: Not(In(['failed', 'cancelled'])),
    })
  }
}

type Candidate = { handle: string; user: XUser; relationship: RelationshipContext; seedCount: number }

const unique = <T>(items: T[]) => [...new Set(items)]

export const uniqueHandles = (handles: string[]) => unique(handles.map((h) => h.replace(/^@/, '').toLowerCase()))

const isStale = (user: XUser | undefined, now: Date) => !user?.fetchedAt || now.getTime() - user.fetchedAt.getTime() > FRESH_MS

function toUser(p: XProfile, now: Date): XUser {
  return Object.assign(new XUser(), {
    xUserId: p.id,
    handle: p.handle,
    name: p.name,
    bio: p.bio,
    followers: p.followers,
    isProtected: p.isProtected,
    orgType: p.orgType,
    receivesYourDm: p.receivesYourDm,
    location: p.location,
    fetchedAt: now,
  })
}

// An upper bound is rounded up to the cent, so "up to" never shows less than it can cost.
const usd = (micros: number, up = false) => `$${((up ? Math.ceil(micros / 10_000) : Math.round(micros / 10_000)) / 100).toFixed(2)}`
