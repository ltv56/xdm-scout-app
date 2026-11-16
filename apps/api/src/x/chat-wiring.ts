import { ChatReader } from './chat-reader'
import { loadChatKeys } from './chat-keys'
import { createChatXdkDecryptor } from './chat-xdk-decryptor'
import { DmMessage, InboundDm } from './x-client'

// Lazy: the keys are opened and the wasm loaded on the first inbound check, not at start-up.
export function lazyChatReader(file: string, tokenKey: string, getJson: (path: string) => Promise<Record<string, any>>) {
  let reader: Promise<ChatReader> | undefined
  const build = async () => {
    const saved = loadChatKeys(file, tokenKey)
    return new ChatReader({ selfId: saved.userId, getJson, decryptor: await createChatXdkDecryptor(saved), handleOf: async () => null })
  }
  const use = async () => (reader ??= build().catch((err) => ((reader = undefined), Promise.reject(err))))
  return {
    readInbound: async (max: number): Promise<InboundDm[]> => (await use()).readInbound(max),
    readConversation: async (userId: string, max: number): Promise<DmMessage[]> => (await use()).readConversation(userId, max),
  }
}
