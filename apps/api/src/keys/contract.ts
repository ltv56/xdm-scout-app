import { z } from 'zod'

export type KeyName = 'xClientId' | 'xClientSecret' | 'openaiApiKey'

// What the Keys page may know about a key: whether it is set, its last 4 characters and where it comes from. Never the key.
export type KeyView = { set: boolean; last4: string | null; source: 'saved' | 'env' | null }
export type KeysView = Record<KeyName, KeyView>

export type KeysPage = { keys: KeysView; callbackUrl: string; canSave: boolean }

const key = z.string().max(300)
export const keysBody = z.object({ xClientId: key.optional(), xClientSecret: key.optional(), openaiApiKey: key.optional() }).strict()
