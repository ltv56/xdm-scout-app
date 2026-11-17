// Micro-USD per item read. X changes prices often, so every figure derived from this is an estimate.
export const PRICES = { profile: 10_000, post: 5_000, following: 10_000, dm_event: 10_000 }

export const MAX_POSTS_PER_USER = 15
// Bounds for the per-campaign limits (campaigns.searchMax, campaigns.followingMax).
export const MAX_FOLLOWING_PER_SEED = 200
export const MIN_FOLLOWING_PER_SEED = 10
// X search/recent returns 10 to 100 posts per call.
export const MIN_SEARCH_RESULTS = 10
export const MAX_SEARCH_RESULTS = 50
export const MIN_FOLLOWERS_MAX = 1000
export const MAX_FOLLOWERS_MAX = 10_000_000
