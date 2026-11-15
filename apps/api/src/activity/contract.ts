export type ActivityKind = 'dnc_added' | 'dnc_removed' | 'known_added' | 'known_removed'

export type ActivityRow = { id: number; at: string; kind: ActivityKind; who: string; detail: string }
