import { describe, expect, it } from 'vitest'
import { builderQuery } from './search-query'

describe('builder search query', () => {
  it('asks for a builder phrase next to the keywords and drops reposts and crypto', () => {
    const q = builderQuery(['robotics', 'embodied AI', 'LLM'])
    expect(q).toMatch(/^\(robotics OR "embodied AI" OR LLM\) \("we built"/)
    expect(q).toContain('-is:retweet')
    expect(q).toContain('-crypto')
  })

  it('stays within the X query limit by dropping the last keywords', () => {
    const q = builderQuery(Array.from({ length: 60 }, (_, i) => `keyword number ${i}`))
    expect(q!.length).toBeLessThanOrEqual(512)
    expect(q).toContain('"keyword number 0"')
  })

  it('has nothing to search without keywords', () => {
    expect(builderQuery([' '])).toBeNull()
  })
})
