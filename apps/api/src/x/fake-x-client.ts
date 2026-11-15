import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DmMessage,
  InboundDm,
  SendDmResult,
  XClient,
  XNotAcceptingDmError,
  XRateLimitError,
  XPost,
  XProfile,
  XUncertainError,
} from './x-client'

export type FakeSendOutcome = 'ok' | 'not-accepting' | 'rejected' | 'rate-limit' | 'timeout-delivered' | 'timeout-undelivered'

export class FakeXClient implements XClient {
  nextSend: FakeSendOutcome = 'ok'
  retryAt = new Date(Date.now() + 15 * 60_000)
  sendCalls = 0
  lookupCalls = 0
  conversationError: Error | null = null
  // Thrown once by the next profile lookup.
  readError: Error | null = null
  readonly sent: { recipientId: string; text: string }[] = []
  readonly conversationReads: { recipientId: string; max?: number }[] = []
  private readonly messages: (DmMessage & { recipientId: string; seq: number })[] = []
  private readonly profiles = new Map<string, XProfile>()
  private readonly posts = new Map<string, XPost[]>()
  private readonly following = new Map<string, string[]>()
  private readonly searches = new Map<string, string[]>()
  readonly searchCalls: { query: string; max: number }[] = []
  private readonly inbound: InboundDm[] = []
  inboundReads = 0
  readonly postExistReads: string[][] = []
  postExistError: Error | null = null
  private counter = 0
  private fixtureDir: string | null = null

  async sendDm(recipientId: string, text: string): Promise<SendDmResult> {
    this.sendCalls += 1
    switch (this.nextSend) {
      case 'not-accepting':
        throw new XNotAcceptingDmError()
      case 'rejected':
        throw new Error('X returned 400: Bad Request')
      case 'rate-limit':
        throw new XRateLimitError(this.retryAt)
      case 'timeout-undelivered':
        throw new XUncertainError('timeout')
      case 'timeout-delivered':
        this.record(recipientId, text, true, new Date())
        throw new XUncertainError('timeout')
      case 'ok': {
        const message = this.record(recipientId, text, true, new Date())
        this.sent.push({ recipientId, text })
        return { conversationId: message.conversationId, eventId: message.eventId }
      }
    }
  }

  async getConversation(recipientId: string, max?: number): Promise<DmMessage[]> {
    this.conversationReads.push({ recipientId, max })
    if (this.conversationError) throw this.conversationError
    const newestFirst = this.messages
      .filter((m) => m.recipientId === recipientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.seq - a.seq)
    return newestFirst.slice(0, max ?? newestFirst.length)
  }

  addInboundDm(dm: { senderId: string; handle: string | null; text: string; createdAt: Date }) {
    this.counter += 1
    this.inbound.push({ eventId: `in-${this.counter}`, conversationId: `${dm.senderId}-100`, ...dm })
  }

  async getPostsExist(ids: string[]): Promise<Set<string>> {
    this.postExistReads.push(ids)
    if (this.postExistError) throw this.postExistError
    const served = new Set([...this.posts.values()].flat().map((p) => p.id))
    return new Set(ids.filter((id) => served.has(id)))
  }

  async getInboundDms(max: number): Promise<InboundDm[]> {
    this.inboundReads += 1
    return [...this.inbound].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, max)
  }

  static fromFixtures(dir = join(process.cwd(), '../../fixtures')) {
    const client = new FakeXClient()
    client.loadFixtures(dir)
    return client
  }

  private loadFixtures(dir: string) {
    this.fixtureDir = dir
    const profiles = JSON.parse(readFileSync(join(dir, 'profiles.json'), 'utf8')) as (Partial<XProfile> & Pick<XProfile, 'id' | 'handle'>)[]
    for (const p of profiles) this.addProfile(p)
    const posts = JSON.parse(readFileSync(join(dir, 'posts.json'), 'utf8')) as Record<string, { id: string; text: string; createdAt: string }[]>
    for (const [userId, list] of Object.entries(posts)) {
      this.addPosts(userId, list.map((p) => ({ ...p, userId, createdAt: new Date(p.createdAt) })))
    }
    const following = JSON.parse(readFileSync(join(dir, 'following.json'), 'utf8')) as Record<string, string[]>
    for (const [userId, handles] of Object.entries(following)) this.addFollowing(userId, handles)
    const searches = JSON.parse(readFileSync(join(dir, 'search.json'), 'utf8')) as Record<string, string[]>
    for (const [query, handles] of Object.entries(searches)) this.addSearch(query, handles)
  }

  // Back to the state of a fresh process: no messages, counters or injected errors, and the fixtures read again.
  reset() {
    this.messages.length = 0
    this.inbound.length = 0
    this.profiles.clear()
    this.posts.clear()
    this.following.clear()
    this.searches.clear()
    this.sent.length = 0
    this.conversationReads.length = 0
    this.searchCalls.length = 0
    this.postExistReads.length = 0
    this.sendCalls = 0
    this.lookupCalls = 0
    this.inboundReads = 0
    this.counter = 0
    this.nextSend = 'ok'
    this.conversationError = null
    this.readError = null
    this.postExistError = null
    if (this.fixtureDir) this.loadFixtures(this.fixtureDir)
  }

  removeProfile(handle: string) {
    this.profiles.delete(handle.toLowerCase())
  }

  addProfile(p: Partial<XProfile> & Pick<XProfile, 'id' | 'handle'>) {
    this.profiles.set(p.handle.toLowerCase(), {
      name: p.handle,
      bio: '',
      followers: 0,
      isProtected: false,
      orgType: null,
      receivesYourDm: null,
      ...p,
    })
  }

  addPosts(userId: string, posts: XPost[]) {
    this.posts.set(userId, posts)
  }

  addFollowing(userId: string, handles: string[]) {
    this.following.set(userId, handles)
  }

  async getFollowing(userId: string, max: number): Promise<XProfile[]> {
    const handles = (this.following.get(userId) ?? []).slice(0, max)
    return handles.flatMap((h) => this.profiles.get(h.toLowerCase()) ?? [])
  }

  // One fake post per handle in the list, in that order.
  addSearch(query: string, authorHandles: string[]) {
    this.searches.set(query, authorHandles)
  }

  async searchRecent(query: string, max: number) {
    this.searchCalls.push({ query, max })
    const authors = (this.searches.get(query) ?? []).slice(0, max).flatMap((h) => this.profiles.get(h.toLowerCase()) ?? [])
    const posts = authors.map((a, i) => ({ id: `s-${i}-${a.id}`, userId: a.id, text: `${query} by ${a.handle}`, createdAt: new Date() }))
    return { posts, authors: [...new Map(authors.map((a) => [a.id, a])).values()] }
  }

  async getRecentPosts(userId: string, max: number): Promise<XPost[]> {
    return (this.posts.get(userId) ?? []).slice(0, max)
  }

  async lookupUsers(handles: string[]): Promise<XProfile[]> {
    this.lookupCalls += 1
    const err = this.readError
    this.readError = null
    if (err) throw err
    return handles.flatMap((h) => this.profiles.get(h.toLowerCase()) ?? [])
  }

  priorMessage(recipientId: string, text: string, createdAt = new Date(0)) {
    return this.record(recipientId, text, false, createdAt)
  }

  deliverSilently(recipientId: string, text: string, createdAt: Date) {
    this.record(recipientId, text, true, createdAt)
  }

  private record(recipientId: string, text: string, fromMe: boolean, createdAt: Date) {
    this.counter += 1
    const message = { recipientId, conversationId: `${'1'.repeat(19)}-${recipientId.padStart(19, '0')}`, eventId: `e-${this.counter}`, text, fromMe, createdAt, seq: this.counter }
    this.messages.push(message)
    return message
  }
}
