import { Logger } from '@nestjs/common'
import { z } from 'zod'
import { DmMessage, InboundDm, SendDmResult, XClient, XPost, XProfile, XNotAcceptingDmError, XRateLimitError, XUncertainError } from './x-client'

const BASE = 'https://api.x.com'
const TIMEOUT_MS = 15_000

const sendResponse = z.object({ data: z.object({ dm_conversation_id: z.string(), dm_event_id: z.string() }) })
const eventsResponse = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().optional(),
        sender_id: z.string(),
        created_at: z.string(),
        dm_conversation_id: z.string(),
        event_type: z.string(),
      }),
    )
    .optional(),
})

const inboundResponse = z.object({
  data: eventsResponse.shape.data,
  includes: z.object({ users: z.array(z.object({ id: z.string(), username: z.string() })).optional() }).optional(),
})

const usersResponse = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        username: z.string(),
        name: z.string(),
        description: z.string().optional(),
        protected: z.boolean().optional(),
        verified_type: z.string().optional(),
        receives_your_dm: z.boolean().optional(),
        location: z.string().optional(),
        public_metrics: z.object({ followers_count: z.number() }).optional(),
      }),
    )
    .optional(),
  meta: z.object({ next_token: z.string().optional() }).optional(),
})

const USER_FIELDS = 'description,protected,public_metrics,verified_type,receives_your_dm,location'

function toProfile(u: NonNullable<z.infer<typeof usersResponse>['data']>[number]): XProfile {
  return {
    id: u.id,
    handle: u.username,
    name: u.name,
    bio: u.description ?? '',
    followers: u.public_metrics?.followers_count ?? 0,
    isProtected: u.protected ?? false,
    orgType: u.verified_type === 'business' || u.verified_type === 'government' ? u.verified_type : null,
    receivesYourDm: u.receives_your_dm ?? null,
    location: u.location?.trim() || null,
  }
}

const postsResponse = z.object({
  data: z.array(z.object({ id: z.string(), text: z.string(), created_at: z.string(), lang: z.string().optional() })).optional(),
})

const postsExistResponse = z.object({ data: z.array(z.object({ id: z.string() })).optional() })

const searchResponse = z.object({
  data: z.array(z.object({ id: z.string(), text: z.string(), created_at: z.string(), author_id: z.string(), lang: z.string().optional() })).optional(),
  includes: z.object({ users: usersResponse.shape.data }).optional(),
  meta: z.object({ next_token: z.string().optional() }).optional(),
})

export class LiveXClient implements XClient {
  constructor(
    private readonly getSession: () => Promise<{ userId: string; token: string }>,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly chat?: { readInbound(max: number): Promise<InboundDm[]>; readConversation(userId: string, max: number): Promise<DmMessage[]> },
  ) {}

  private readonly log = new Logger(LiveXClient.name)

  // GET for the X Chat reader: same token, rate-limit and error handling as every other call.
  async getJson(path: string): Promise<Record<string, any>> {
    return (await this.call(path, 'GET')).json()
  }

  async sendDm(recipientId: string, text: string): Promise<SendDmResult> {
    const res = await this.call(`/2/dm_conversations/with/${recipientId}/messages`, 'POST', { text })
    const parsed = sendResponse.parse(await res.json())
    return { conversationId: parsed.data.dm_conversation_id, eventId: parsed.data.dm_event_id }
  }

  // Plain DMs plus the encrypted X Chat messages with the same person; a failing chat read must not hide the plain ones.
  async getConversation(recipientId: string, max?: number): Promise<DmMessage[]> {
    const plain = await this.getPlainConversation(recipientId, max)
    if (!this.chat) return plain
    const encrypted = await this.chat.readConversation(recipientId, max ?? 100).catch((err) => {
      this.log.warn('X Chat read failed: ' + String(err).slice(0, 200))
      return []
    })
    const merged = [...plain, ...encrypted].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return max === undefined ? merged : merged.slice(0, max)
  }

  private async getPlainConversation(recipientId: string, max?: number): Promise<DmMessage[]> {
    const { userId } = await this.getSession()
    const query = new URLSearchParams({
      'dm_event.fields': 'created_at,sender_id,text,dm_conversation_id,event_type',
      event_types: 'MessageCreate',
      ...(max !== undefined && { max_results: String(Math.min(100, Math.max(1, max))) }),
    })
    const res = await this.call(`/2/dm_conversations/with/${recipientId}/dm_events?${query}`, 'GET')
    const parsed = eventsResponse.parse(await res.json())
    return (parsed.data ?? [])
      .filter((e) => e.event_type === 'MessageCreate')
      .map((e) => ({
        conversationId: e.dm_conversation_id,
        eventId: e.id,
        text: e.text ?? '',
        fromMe: e.sender_id === userId,
        createdAt: new Date(e.created_at),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  // Plain DMs from /2/dm_events plus encrypted X Chat messages; a failing chat read must not hide the plain ones.
  async getInboundDms(max: number): Promise<InboundDm[]> {
    const plain = await this.getPlainInboundDms(max)
    if (!this.chat) return plain
    const encrypted = await this.chat.readInbound(max).catch((err) => {
      this.log.warn('X Chat read failed: ' + String(err).slice(0, 200))
      return []
    })
    return [...plain, ...encrypted].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, max)
  }

  private async getPlainInboundDms(max: number): Promise<InboundDm[]> {
    const { userId } = await this.getSession()
    const query = new URLSearchParams({
      'dm_event.fields': 'created_at,sender_id,text,dm_conversation_id,event_type',
      event_types: 'MessageCreate',
      expansions: 'sender_id',
      'user.fields': 'username',
      max_results: String(Math.min(100, Math.max(1, max))),
    })
    const parsed = inboundResponse.parse(await (await this.call(`/2/dm_events?${query}`, 'GET')).json())
    const handles = new Map((parsed.includes?.users ?? []).map((u) => [u.id, u.username]))
    return (parsed.data ?? [])
      .filter((e) => e.event_type === 'MessageCreate' && e.sender_id !== userId)
      .map((e) => ({ eventId: e.id, conversationId: e.dm_conversation_id, senderId: e.sender_id, handle: handles.get(e.sender_id) ?? null, text: e.text ?? '', createdAt: new Date(e.created_at) }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  async getRecentPosts(userId: string, max: number): Promise<XPost[]> {
    const query = new URLSearchParams({
      max_results: String(Math.max(5, max)),
      'tweet.fields': 'created_at,lang',
      exclude: 'retweets',
    })
    const parsed = postsResponse.parse(await (await this.call(`/2/users/${userId}/tweets?${query}`, 'GET')).json())
    return (parsed.data ?? []).slice(0, max).map((p) => ({ id: p.id, userId, text: p.text, createdAt: new Date(p.created_at), lang: p.lang }))
  }

  // Posts X no longer has come back in `errors`, not in `data`; only `data` counts as existing.
  async getPostsExist(ids: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    for (let i = 0; i < ids.length; i += 100) {
      const query = new URLSearchParams({ ids: ids.slice(i, i + 100).join(','), 'tweet.fields': 'id' })
      const parsed = postsExistResponse.parse(await (await this.call(`/2/tweets?${query}`, 'GET')).json())
      for (const p of parsed.data ?? []) found.add(p.id)
    }
    return found
  }

  async lookupUsers(handles: string[]): Promise<XProfile[]> {
    const out: XProfile[] = []
    for (let i = 0; i < handles.length; i += 100) {
      const query = new URLSearchParams({ usernames: handles.slice(i, i + 100).join(','), 'user.fields': USER_FIELDS })
      const parsed = usersResponse.parse(await (await this.call(`/2/users/by?${query}`, 'GET')).json())
      out.push(...(parsed.data ?? []).map(toProfile))
    }
    return out
  }

  async searchRecent(query: string, max: number) {
    const posts: XPost[] = []
    const authors = new Map<string, XProfile>()
    let token: string | undefined
    do {
      const params = new URLSearchParams({
        query,
        max_results: String(Math.min(100, Math.max(10, max - posts.length))),
        'tweet.fields': 'created_at,author_id,lang',
        expansions: 'author_id',
        'user.fields': USER_FIELDS,
        ...(token && { next_token: token }),
      })
      const parsed = searchResponse.parse(await (await this.call(`/2/tweets/search/recent?${params}`, 'GET')).json())
      for (const p of parsed.data ?? []) posts.push({ id: p.id, userId: p.author_id, text: p.text, createdAt: new Date(p.created_at), lang: p.lang })
      for (const u of parsed.includes?.users ?? []) authors.set(u.id, toProfile(u))
      token = parsed.meta?.next_token
    } while (token && posts.length < max)
    return { posts: posts.slice(0, max), authors: [...authors.values()] }
  }

  // X bills each user returned, so stop paging once max is reached.
  async getFollowing(userId: string, max: number): Promise<XProfile[]> {
    const out: XProfile[] = []
    let token: string | undefined
    do {
      const query = new URLSearchParams({
        max_results: String(Math.min(1000, Math.max(1, max - out.length))),
        'user.fields': USER_FIELDS,
        ...(token && { pagination_token: token }),
      })
      const parsed = usersResponse.parse(await (await this.call(`/2/users/${userId}/following?${query}`, 'GET')).json())
      out.push(...(parsed.data ?? []).map(toProfile))
      token = parsed.meta?.next_token
    } while (token && out.length < max)
    return out.slice(0, max)
  }

  private async call(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
    // Outside the try: a failed login means nothing went to X, so it must not read as an uncertain send.
    const { token } = await this.getSession()
    let res: Response
    try {
      res = await this.fetchFn(BASE + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new XUncertainError('network error or timeout')
    }
    if (res.ok) return res

    const problem: { type?: string; title?: string; detail?: string } = await res.json().catch(() => ({}))
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset'))
      throw new XRateLimitError(new Date(reset ? reset * 1000 : Date.now() + 15 * 60_000))
    }
    if (res.status === 403 && problem.type?.includes('dm-recipient-not-accepting')) throw new XNotAcceptingDmError()
    if (res.status >= 500) throw new XUncertainError(`X returned ${res.status}`)
    throw new Error(`X returned ${res.status}: ${problem.title ?? ''} ${problem.detail ?? ''}`.trim())
  }
}
