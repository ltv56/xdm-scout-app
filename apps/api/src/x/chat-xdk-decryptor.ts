import { ChatDecryptor, DecryptedEvent, SigningKey } from './chat-reader'
import { ChatKeys } from './chat-keys'

type ServerChat = {
  importKeys(p: { keys: Uint8Array; signingKeyVersion: string }): void
  setIdentity(p: { userId: string; signingKeyVersion: string }): void
  setCacheKeys(on: boolean): void
  setSigningKeys(k: SigningKey[]): void
  decryptEvents(p: { events: string[] }): { events: { event: DecryptedEvent }[] }
}

// The package is ESM-only; a plain import() would be compiled to require().
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<{ createChat(): Promise<ServerChat> }>

// Loads the saved private keys once; no passcode and no Juicebox at runtime.
export async function createChatXdkDecryptor(saved: ChatKeys): Promise<ChatDecryptor> {
  const chat = await (await esmImport('@xdevplatform/chat-xdk-server')).createChat()
  chat.importKeys({ keys: saved.keys, signingKeyVersion: saved.signingKeyVersion })
  chat.setIdentity({ userId: saved.userId, signingKeyVersion: saved.signingKeyVersion })
  chat.setCacheKeys(true)
  return {
    decrypt(raw, signingKeys) {
      chat.setSigningKeys(signingKeys)
      return chat.decryptEvents({ events: raw }).events.map((e) => e.event)
    },
  }
}
