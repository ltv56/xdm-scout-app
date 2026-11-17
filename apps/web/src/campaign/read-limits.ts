// The limits are what the estimate multiplies: lower them to make a search cheaper and narrower.
export const SEARCH_RANGE = [10, 50] as const
export const FOLLOWING_RANGE = [10, 200] as const
export const FOLLOWERS_RANGE = [1000, 10_000_000] as const

const inRange = (value: string, [min, max]: readonly [number, number]) => /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max

export function readLimitsProblem(searchMax: string, followingMax: string, followersMax: string): string | null {
  if (!inRange(searchMax, SEARCH_RANGE)) return `Posts per search query must be a whole number from ${SEARCH_RANGE[0]} to ${SEARCH_RANGE[1]}.`
  if (!inRange(followingMax, FOLLOWING_RANGE)) return `People per seed account must be a whole number from ${FOLLOWING_RANGE[0]} to ${FOLLOWING_RANGE[1]}.`
  if (!inRange(followersMax, FOLLOWERS_RANGE)) return `Followers ceiling must be a whole number from ${FOLLOWERS_RANGE[0].toLocaleString('en-US')} to ${FOLLOWERS_RANGE[1].toLocaleString('en-US')}.`
  return null
}
