import { describe, expect, it } from 'vitest'
import { LiveXClient } from './live-x-client'
import { XNotAcceptingDmError, XRateLimitError, XUncertainError } from './x-client'

type Call = { url: string; init: RequestInit }

function clientWith(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }
  const client = new LiveXClient(async () => ({ userId: '100', token: 'tok' }), fetchFn as typeof fetch)
  return { client, calls }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

describe('LiveXClient.sendDm', () => {
  it('posts to the with/<id> endpoint with a bearer token and returns ids', async () => {
    const { client, calls } = clientWith(() =>
      json(201, { data: { dm_conversation_id: '100-200', dm_event_id: '555' } }),
    )
    const result = await client.sendDm('200', 'Hi')
    expect(result).toEqual({ conversationId: '100-200', eventId: '555' })
    expect(calls[0].url).toBe('https://api.x.com/2/dm_conversations/with/200/messages')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: 'Hi' })
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('maps dm-recipient-not-accepting to XNotAcceptingDmError', async () => {
    const { client } = clientWith(() =>
      json(403, { type: 'https://api.x.com/2/problems/dm-recipient-not-accepting', title: 'Forbidden' }),
    )
    await expect(client.sendDm('200', 'Hi')).rejects.toBeInstanceOf(XNotAcceptingDmError)
  })

  it('maps 429 to XRateLimitError using the reset header', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600
    const { client } = clientWith(() => json(429, { title: 'Too Many Requests' }, { 'x-rate-limit-reset': String(reset) }))
    const err = await client.sendDm('200', 'Hi').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(XRateLimitError)
    expect((err as XRateLimitError).retryAt.getTime()).toBe(reset * 1000)
  })

  it('maps 5xx to XUncertainError', async () => {
    const { client } = clientWith(() => json(503, {}))
    await expect(client.sendDm('200', 'Hi')).rejects.toBeInstanceOf(XUncertainError)
  })

  it('maps a network failure to XUncertainError', async () => {
    const { client } = clientWith(() => {
      throw new TypeError('fetch failed')
    })
    await expect(client.sendDm('200', 'Hi')).rejects.toBeInstanceOf(XUncertainError)
  })

  it('reports a failed login as itself, not as an uncertain send, and calls X for nothing', async () => {
    let called = false
    const fetchFn = (async () => {
      called = true
      return json(201, {})
    }) as typeof fetch
    const client = new LiveXClient(async () => Promise.reject(new Error('X login expired. Reconnect the X account on Profile.')), fetchFn)
    const err = await client.sendDm('200', 'Hi').catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(XUncertainError)
    expect((err as Error).message).toContain('Reconnect')
    expect(called).toBe(false)
  })

  it('treats other 4xx as a definite failure, not uncertain', async () => {
    const { client } = clientWith(() => json(400, { title: 'Invalid Request' }))
    const err = await client.sendDm('200', 'Hi').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(XUncertainError)
  })
})

describe('LiveXClient.getConversation', () => {
  it('maps events and marks messages from the sender account as fromMe', async () => {
    const { client, calls } = clientWith(() =>
      json(200, {
        data: [
          { id: '2', text: 'reply', sender_id: '200', created_at: '2026-11-12T10:01:00.000Z', dm_conversation_id: '100-200', event_type: 'MessageCreate' },
          { id: '1', text: 'Hi', sender_id: '100', created_at: '2026-11-12T10:00:00.000Z', dm_conversation_id: '100-200', event_type: 'MessageCreate' },
        ],
      }),
    )
    const messages = await client.getConversation('200')
    expect(messages).toEqual([
      { conversationId: '100-200', eventId: '2', text: 'reply', fromMe: false, createdAt: new Date('2026-11-12T10:01:00.000Z') },
      { conversationId: '100-200', eventId: '1', text: 'Hi', fromMe: true, createdAt: new Date('2026-11-12T10:00:00.000Z') },
    ])
    expect(calls[0].url).toContain('/2/dm_conversations/with/200/dm_events')
    expect(calls[0].url).toContain('dm_event.fields=')
  })

  it('asks X for only the latest events when a max is given', async () => {
    const { client, calls } = clientWith(() => json(200, { meta: { result_count: 0 } }))
    await client.getConversation('200', 1)
    expect(new URL(calls[0].url).searchParams.get('max_results')).toBe('1')
  })

  it('returns an empty list when there is no conversation yet', async () => {
    const { client } = clientWith(() => json(200, { meta: { result_count: 0 } }))
    expect(await client.getConversation('200')).toEqual([])
  })

  it('maps a read timeout to XUncertainError', async () => {
    const { client } = clientWith(() => json(500, {}))
    await expect(client.getConversation('200')).rejects.toBeInstanceOf(XUncertainError)
  })
})

describe('LiveXClient.getInboundDms', () => {
  it('keeps only DMs from other people and attaches their handles', async () => {
    const { client, calls } = clientWith(() =>
      json(200, {
        data: [
          { id: '2', text: 'build', sender_id: '200', created_at: '2026-11-12T10:01:00.000Z', dm_conversation_id: '100-200', event_type: 'MessageCreate' },
          { id: '1', text: 'Hi', sender_id: '100', created_at: '2026-11-12T10:00:00.000Z', dm_conversation_id: '100-200', event_type: 'MessageCreate' },
        ],
        includes: { users: [{ id: '200', username: 'mina_builds' }] },
      }),
    )
    expect(await client.getInboundDms(50)).toEqual([
      { eventId: '2', conversationId: '100-200', senderId: '200', handle: 'mina_builds', text: 'build', createdAt: new Date('2026-11-12T10:01:00.000Z') },
    ])
    expect(calls[0].url).toContain('/2/dm_events?')
    expect(new URL(calls[0].url).searchParams.get('max_results')).toBe('50')
  })
})

describe('LiveXClient.getInboundDms with X Chat', () => {
  const plain = json(200, { data: [{ id: '1', text: 'plain', sender_id: '200', created_at: '2026-11-12T10:00:00.000Z', dm_conversation_id: '100-200', event_type: 'MessageCreate' }] })
  const chatDm = { eventId: 'uuid-1', conversationId: '100-300', senderId: '300', handle: null, text: 'from chat', createdAt: new Date('2026-11-12T11:00:00.000Z') }
  const withChat = (readInbound: (max: number) => Promise<(typeof chatDm)[]>) => {
    const fetchFn = async () => plain.clone()
    return new LiveXClient(async () => ({ userId: '100', token: 'tok' }), fetchFn as typeof fetch, { readInbound, readConversation: async () => [] })
  }

  it('merges encrypted-chat messages with the plain ones, newest first', async () => {
    const dms = await withChat(async () => [chatDm]).getInboundDms(10)
    expect(dms.map((d) => d.text)).toEqual(['from chat', 'plain'])
  })

  it('still returns the plain DMs when the chat read fails', async () => {
    const dms = await withChat(async () => { throw new Error('boom') }).getInboundDms(10)
    expect(dms.map((d) => d.text)).toEqual(['plain'])
  })
})

describe('LiveXClient.getConversation with X Chat', () => {
  const plain = json(200, { data: [{ id: '1', text: 'plain', sender_id: '100', created_at: '2026-11-12T10:00:00.000Z', dm_conversation_id: '100-300', event_type: 'MessageCreate' }] })
  const reply = { conversationId: '100-300', eventId: 'uuid-9', text: 'reply in chat', fromMe: false, createdAt: new Date('2026-11-12T11:00:00.000Z') }
  const withChat = (readConversation: (id: string, max: number) => Promise<(typeof reply)[]>) =>
    new LiveXClient(async () => ({ userId: '100', token: 'tok' }), (async () => plain.clone()) as typeof fetch, { readInbound: async () => [], readConversation })

  it('adds the encrypted-chat messages with that person, newest first', async () => {
    const msgs = await withChat(async () => [reply]).getConversation('300', 5)
    expect(msgs.map((m) => [m.text, m.fromMe])).toEqual([['reply in chat', false], ['plain', true]])
  })

  it('keeps the plain messages when the chat read fails', async () => {
    const msgs = await withChat(async () => { throw new Error('boom') }).getConversation('300', 5)
    expect(msgs.map((m) => m.text)).toEqual(['plain'])
  })
})

const user = (id: string, username: string) => ({ id, username, name: username, description: 'robotics', public_metrics: { followers_count: 5 } })

describe('LiveXClient receives_your_dm', () => {
  it('maps a missing field to null, and keeps true and false', async () => {
    const { client } = clientWith(() =>
      json(200, {
        data: [
          { id: '1', username: 'open', name: 'o', receives_your_dm: true },
          { id: '2', username: 'closed', name: 'c', receives_your_dm: false },
          { id: '3', username: 'silent', name: 's' },
        ],
      }),
    )
    const profiles = await client.lookupUsers(['open', 'closed', 'silent'])
    expect(profiles.map((p) => [p.handle, p.receivesYourDm])).toEqual([
      ['open', true],
      ['closed', false],
      ['silent', null],
    ])
  })

  it('reads the website link of a profile, expanded from the t.co link when X gives it', async () => {
    const { client, calls } = clientWith(() =>
      json(200, {
        data: [
          { id: '1', username: 'site', name: 's', url: 'https://t.co/abc', entities: { url: { urls: [{ url: 'https://t.co/abc', expanded_url: 'https://acme.ai' }] } } },
          { id: '2', username: 'short', name: 't', url: 'https://t.co/xyz' },
          { id: '3', username: 'none', name: 'n', url: '' },
        ],
      }),
    )
    const profiles = await client.lookupUsers(['site', 'short', 'none'])
    expect(profiles.map((p) => p.website)).toEqual(['https://acme.ai', 'https://t.co/xyz', null])
    expect(new URL(calls[0].url).searchParams.get('user.fields')).toContain('url')
  })
})

describe('LiveXClient discovery reads', () => {
  it('pages following until max and asks only for what is left', async () => {
    const { client, calls } = clientWith((call) =>
      call.url.includes('pagination_token')
        ? json(200, { data: [user('3', 'c'), user('4', 'd')] })
        : json(200, { data: [user('1', 'a'), user('2', 'b')], meta: { next_token: 'T' } }),
    )
    const result = await client.getFollowing('9', 3)
    expect(result.map((p) => p.handle)).toEqual(['a', 'b', 'c'])
    expect(new URL(calls[0].url).pathname).toBe('/2/users/9/following')
    expect(new URL(calls[0].url).searchParams.get('max_results')).toBe('3')
    expect(new URL(calls[1].url).searchParams.get('max_results')).toBe('1')
  })

  it('reads followers from the followers list, not the following list', async () => {
    const { client, calls } = clientWith(() => json(200, { data: [user('1', 'a')] }))
    expect((await client.getFollowers('9', 5)).map((p) => p.handle)).toEqual(['a'])
    expect(new URL(calls[0].url).pathname).toBe('/2/users/9/followers')
  })

  it('searches recent posts with author expansion and returns posts and authors', async () => {
    const { client, calls } = clientWith(() =>
      json(200, {
        data: [
          { id: 'p1', text: 'robot arm', created_at: '2026-11-11T00:00:00Z', author_id: '1' },
          { id: 'p2', text: 'robot arm v2', created_at: '2026-11-11T01:00:00Z', author_id: '1' },
        ],
        includes: { users: [user('1', 'a')] },
      }),
    )
    const result = await client.searchRecent('"robot arm" -is:retweet', 50)
    expect(result.posts.map((p) => [p.id, p.userId])).toEqual([
      ['p1', '1'],
      ['p2', '1'],
    ])
    expect(result.authors.map((a) => a.handle)).toEqual(['a'])
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/2/tweets/search/recent')
    expect(url.searchParams.get('query')).toBe('"robot arm" -is:retweet')
    expect(url.searchParams.get('expansions')).toBe('author_id')
    expect(url.searchParams.get('tweet.fields')).toBe('created_at,author_id,lang')
  })

  it('asks for the language of each post and keeps it', async () => {
    const { client, calls } = clientWith(() => json(200, { data: [{ id: 'p1', text: 'xin chao', created_at: '2026-11-11T00:00:00Z', lang: 'vi' }, { id: 'p2', text: 'hi', created_at: '2026-11-11T01:00:00Z' }] }))
    const posts = await client.getRecentPosts('1', 10)
    expect(posts.map((p) => p.lang)).toEqual(['vi', undefined])
    expect(new URL(calls[0].url).searchParams.get('tweet.fields')).toBe('created_at,lang')
  })

  it('reads only posts the person wrote themselves: no reposts, no replies', async () => {
    const { client, calls } = clientWith(() => json(200, { data: [] }))
    await client.getRecentPosts('1', 15)
    expect(new URL(calls[0].url).searchParams.get('exclude')).toBe('retweets,replies')
  })
})

describe('LiveXClient.getPostsExist', () => {
  it('asks X for the posts by id and returns the ones it still serves', async () => {
    const { client, calls } = clientWith(() => json(200, { data: [{ id: '1' }, { id: '3' }], errors: [{ resource_id: '2', title: 'Not Found Error', type: 'https://api.twitter.com/2/problems/resource-not-found' }] }))
    expect([...(await client.getPostsExist(['1', '2', '3']))].sort()).toEqual(['1', '3'])
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/2/tweets')
    expect(url.searchParams.get('ids')).toBe('1,2,3')
    expect(url.searchParams.get('tweet.fields')).toBe('id')
  })

  it('answers none when X returns no data at all', async () => {
    const { client } = clientWith(() => json(200, { errors: [{ resource_id: '1', title: 'Not Found Error' }] }))
    expect((await client.getPostsExist(['1'])).size).toBe(0)
  })

  it('asks in groups of 100 and makes no call for no ids', async () => {
    const { client, calls } = clientWith(() => json(200, {}))
    await client.getPostsExist([])
    expect(calls).toHaveLength(0)
    await client.getPostsExist(Array.from({ length: 101 }, (_, i) => String(i + 1)))
    expect(calls.map((c) => new URL(c.url).searchParams.get('ids')!.split(',').length)).toEqual([100, 1])
  })

  it('does not treat a failed call as deleted posts', async () => {
    const { client } = clientWith(() => json(500, { title: 'boom' }))
    await expect(client.getPostsExist(['1'])).rejects.toThrow()
  })
})
