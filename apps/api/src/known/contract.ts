export type KnownPerson = { xUserId: string; handle: string; listName: string; since: string }

export type ImportResult = { added: number; alreadyKnown: number; notFound: string[]; invalid: string[] }
