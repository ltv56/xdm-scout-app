export type KnownKind = 'known' | 'warm'
export type KnownPerson = { xUserId: string; handle: string; listName: string; kind: KnownKind; event: string | null; since: string }

export type ImportResult = { added: number; alreadyKnown: number; notFound: string[]; invalid: string[] }

// AI read of an uploaded file: the handles it holds, with the line each is on, and what the read cost.
export type FoundHandle = { handle: string; lineNo: number; line: string }
export type ExtractEstimate = { model: string | null; inputTokens: number; outputTokens: number; costMicros: number | null }
export type ExtractResult = ExtractEstimate & { handles: FoundHandle[]; missedLines: { lineNo: number; line: string }[] }
