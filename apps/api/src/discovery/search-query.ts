// X recent search caps a query at 512 characters.
const MAX_QUERY = 512
const BUILDER = '("we built" OR "we\'re building" OR "just launched" OR "open-sourced" OR "we released" OR "shipped")'
const NOISE = '-is:retweet -is:reply -crypto -airdrop -giveaway -NFT lang:en'

const term = (k: string) => (/\s/.test(k.trim()) ? `"${k.trim()}"` : k.trim())

// A bare keyword search on X returns news and hype accounts; asking for a builder phrase finds people shipping things.
export function builderQuery(keywords: string[]): string | null {
  const terms = keywords.map(term).filter(Boolean)
  const fixed = BUILDER.length + NOISE.length + 4
  while (terms.length && `(${terms.join(' OR ')})`.length + fixed > MAX_QUERY) terms.pop()
  return terms.length ? `(${terms.join(' OR ')}) ${BUILDER} ${NOISE}` : null
}
