export type KnownKind = 'known' | 'warm'
export type KnownPerson = { xUserId: string; handle: string; listName: string; kind: KnownKind; event: string | null; since: string }

export type ImportResult = { added: number; alreadyKnown: number; notFound: string[]; invalid: string[] }
