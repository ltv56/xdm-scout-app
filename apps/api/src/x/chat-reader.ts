import { DmMessage, InboundDm } from './x-client'

// What chat-xdk returns for one decrypted event; only the fields we read.
export type DecryptedEvent = { type: string; id: string; senderId: string; createdAtMsec: number; verified: boolean; content?: { text?: string } }

export type SigningKey = { userId: string; publicKeyVersion: string; publicKey: string; identityPublicKey: string; identityPublicKeySignature: string }

// Keys stay behind this port so tests never need real key material.
export interface ChatDecryptor {
  decrypt(raw: string[], signingKeys: SigningKey[]): DecryptedEvent[]
}

type KeyRecord = { public_key_version: string | number; public_key?: string; signing_public_key?: string; identity_public_key_signature?: string }
type Json = Record<string, any>

export type ChatReaderDeps = {
  selfId: string
  getJson: (path: string) => Promise<Json>
  decryptor: ChatDecryptor
  handleOf: (userId: string) => Promise<string | null>
}

// Reads X Chat (end-to-end encrypted) conversations of the sender and returns what other people wrote to it.
export class ChatReader {
  constructor(private readonly deps: ChatReaderDeps) {}

  async readInbound(max: number): Promise<InboundDm[]> {
    const { selfId, getJson } = this.deps
    const list = await getJson('/2/chat/conversations?max_results=100')
    const others: string[] = (list.data ?? [])
      .filter((c: Json) => c.type === 'direct')
      .map((c: Json) => (c.participant_ids as string[]).find((id) => id !== selfId))
      .filter((id: string | undefined): id is string => !!id)
    if (!others.length) return []

    const mine = await this.signingKeys(selfId)
    const out: InboundDm[] = []
    for (const other of others) {
      const events = await this.verifiedMessages(other, max, mine)
      if (!events.length) continue
      const handle = await this.deps.handleOf(other)
      for (const e of events) {
        if (e.senderId === selfId) continue
        out.push({ eventId: e.id, conversationId: `${selfId}-${other}`, senderId: e.senderId, handle, text: e.content!.text!, createdAt: new Date(e.createdAtMsec) })
      }
    }
    return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, max)
  }

  // Both sides of the chat with one person, newest first.
  async readConversation(other: string, max: number): Promise<DmMessage[]> {
    const { selfId } = this.deps
    const events = await this.verifiedMessages(other, max, await this.signingKeys(selfId))
    return events
      .map((e) => ({ conversationId: `${selfId}-${other}`, eventId: e.id, text: e.content!.text!, fromMe: e.senderId === selfId, createdAt: new Date(e.createdAtMsec) }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, max)
  }

  // Decrypted, signature-checked text messages of one chat.
  private async verifiedMessages(other: string, max: number, mine: SigningKey[]): Promise<DecryptedEvent[]> {
    const page = await this.deps.getJson(`/2/chat/conversations/${other}/events?max_results=${Math.min(100, Math.max(1, max))}`)
    const raw = [...((page.meta?.conversation_key_events as string[]) ?? []), ...((page.data ?? []) as Json[]).map((e) => e.encoded_event).filter(Boolean)]
    if (!raw.length) return []
    const events = this.deps.decryptor.decrypt(raw, [...mine, ...(await this.signingKeys(other))])
    return events.filter((e) => e.type === 'message' && e.verified && !!e.content?.text)
  }

  private async signingKeys(userId: string): Promise<SigningKey[]> {
    const res = await this.deps.getJson(`/2/users/${userId}/public_keys`)
    return ((res.data ?? []) as KeyRecord[]).map((r) => ({
      userId,
      publicKeyVersion: String(r.public_key_version),
      publicKey: r.signing_public_key ?? '',
      identityPublicKey: r.public_key ?? '',
      identityPublicKeySignature: r.identity_public_key_signature ?? '',
    }))
  }
}
