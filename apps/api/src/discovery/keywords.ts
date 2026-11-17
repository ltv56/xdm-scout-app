const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whole words only, so "AI" does not match "Thailand"; a plural s or es on the last word still counts.
// The first other account a bio names, like "CTO at @acmebots": most often where they work. Lower case.
export function companyHandle(bio: string, own: string): string | null {
  for (const [, h] of bio.matchAll(/(?<![\w@])@(\w{1,15})\b/g)) if (h.toLowerCase() !== own.toLowerCase()) return h.toLowerCase()
  return null
}

export function bioHasKeyword(bio: string, keywords: string[]): boolean {
  return keywords.some((k) => {
    const words = k.trim().split(/\s+/).filter(Boolean).map(escape)
    if (!words.length) return false
    const pattern = `(?<![\\p{L}\\p{N}_])${words.join('\\s+')}(?:e?s)?(?![\\p{L}\\p{N}_])`
    return new RegExp(pattern, 'iu').test(bio)
  })
}
