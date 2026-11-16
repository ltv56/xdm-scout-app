import { describe, expect, it } from 'vitest'
import { ChatDecryptor, ChatReader, DecryptedEvent } from './chat-reader'

const ME = '100'
const keyRecord = (version: string) => ({ public_key_version: version, public_key: 'idpub', signing_public_key: 'sigpub', identity_public_key_signature: 'sig' })

const message = (id: string, senderId: string, text: string, at: number, verified = true): DecryptedEvent => ({ type: 'message', id, senderId, createdAtMsec: at, verified, content: { text } })

function readerWith(opts: { events: Record<string, DecryptedEvent[]>; conversations?: string[]; handles?: Record<string, string> }) {
  const paths: string[] = []
  const decrypted: string[][] = []
  const decryptor: ChatDecryptor = {
    decrypt: (raw) => {
      decrypted.push(raw)
      return raw.flatMap((r) => (r.startsWith('enc:') ? opts.events[r.slice(4).split('/')[0]].filter((e) => e.id === r.split('/')[1]) : []))
    },
  }
  const conversations = opts.conversations ?? Object.keys(opts.events)
  const getJson = async (path: string): Promise<any> => {
    paths.push(path)
    if (path.startsWith('/2/chat/conversations?')) {
      return { data: conversations.map((o) => ({ id: `${ME}-${o}`, type: 'direct', participant_ids: [o] })), meta: { has_more: false } }
    }
    const events = path.match(/^\/2\/chat\/conversations\/(\d+)\/events/)
    if (events) {
      const other = events[1]
      return { data: opts.events[other].map((e) => ({ id: 'x' + e.id, encoded_event: `enc:${other}/${e.id}` })), meta: { conversation_key_events: [`key:${other}`] } }
    }
    const keys = path.match(/^\/2\/users\/(\d+)\/public_keys/)
    if (keys) return { data: [keyRecord('1'), keyRecord('7')] }
    throw new Error('unexpected ' + path)
  }
  return { reader: new ChatReader({ selfId: ME, getJson, decryptor, handleOf: async (id) => opts.handles?.[id] ?? null }), paths, decrypted }
}

describe('ChatReader.readInbound', () => {
  it('returns verified text messages from other people, newest first, as inbound DMs', async () => {
    const { reader } = readerWith({
      events: { '200': [message('a', '200', 'first', 1000), message('b', ME, 'my reply', 2000), message('c', '200', 'second', 3000)] },
      handles: { '200': 'alice' },
    })
    const dms = await reader.readInbound(10)
    expect(dms.map((d) => [d.eventId, d.text, d.senderId, d.handle, d.conversationId])).toEqual([
      ['c', 'second', '200', 'alice', '100-200'],
      ['a', 'first', '200', 'alice', '100-200'],
    ])
    expect(dms[0].createdAt).toEqual(new Date(3000))
  })

  it('skips unverified messages, events without text and non-message events', async () => {
    const { reader } = readerWith({
      events: {
        '200': [
          message('a', '200', 'forged', 1000, false),
          { type: 'message', id: 'b', senderId: '200', createdAtMsec: 2000, verified: true, content: {} },
          { type: 'readReceipt', id: 'c', senderId: '200', createdAtMsec: 3000, verified: true },
          message('d', '200', 'real', 4000),
        ],
      },
    })
    expect((await reader.readInbound(10)).map((d) => d.text)).toEqual(['real'])
  })

  it('passes the conversation key events with the events, and registers both people keys', async () => {
    const { reader, decrypted, paths } = readerWith({ events: { '200': [message('a', '200', 'hi', 1)] } })
    await reader.readInbound(10)
    expect(decrypted[0][0]).toBe('key:200')
    expect(paths.filter((p) => p.includes('/public_keys'))).toHaveLength(2)
  })

  it('keeps only the newest max messages across conversations', async () => {
    const { reader } = readerWith({ events: { '200': [message('a', '200', 'old', 1), message('b', '200', 'mid', 5)], '300': [message('c', '300', 'new', 9)] } })
    expect((await reader.readInbound(2)).map((d) => d.text)).toEqual(['new', 'mid'])
  })

  it('does not decrypt your own note-to-self conversation', async () => {
    const { reader, paths } = readerWith({ events: { '200': [message('a', '200', 'hi', 1)] }, conversations: ['200', ME] })
    await reader.readInbound(10)
    expect(paths.some((p) => p.includes(`/conversations/${ME}/events`))).toBe(false)
  })
})

describe('ChatReader.readConversation', () => {
  it('returns both sides of one chat as messages, newest first, marking our own', async () => {
    const { reader, paths } = readerWith({ events: { '200': [message('a', '200', 'hi', 1000), message('b', ME, 'we reply', 2000), message('c', '200', 'thanks', 3000)] } })
    const msgs = await reader.readConversation('200', 10)
    expect(msgs.map((m) => [m.eventId, m.text, m.fromMe, m.conversationId])).toEqual([
      ['c', 'thanks', false, '100-200'],
      ['b', 'we reply', true, '100-200'],
      ['a', 'hi', false, '100-200'],
    ])
    expect(paths.some((p) => p.startsWith('/2/chat/conversations?'))).toBe(false)
  })

  it('skips unverified messages and keeps at most max', async () => {
    const { reader } = readerWith({ events: { '200': [message('a', '200', 'forged', 1000, false), message('b', '200', 'one', 2000), message('c', '200', 'two', 3000)] } })
    expect((await reader.readConversation('200', 1)).map((m) => m.text)).toEqual(['two'])
    expect((await reader.readConversation('200', 5)).map((m) => m.text)).toEqual(['two', 'one'])
  })

  it('is empty when there is no chat with that person', async () => {
    const { reader } = readerWith({ events: { '200': [] } })
    expect(await reader.readConversation('200', 5)).toEqual([])
  })
})
