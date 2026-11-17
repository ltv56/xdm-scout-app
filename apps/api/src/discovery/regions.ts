// Default regions for a fund that backs Southeast Asia: countries, big cities and how people write them.
export const SEA_REGIONS = [
  'Southeast Asia', 'SEA', 'ASEAN',
  'Singapore', 'SG',
  'Malaysia', 'Kuala Lumpur', 'KL', 'Selangor', 'Penang', 'Johor',
  'Indonesia', 'Jakarta', 'Bandung', 'Bali', 'Surabaya', 'Yogyakarta',
  'Thailand', 'Bangkok', 'Chiang Mai',
  'Vietnam', 'Viet Nam', 'Hanoi', 'Ha Noi', 'Ho Chi Minh', 'Saigon', 'Da Nang',
  'Philippines', 'Manila', 'Makati', 'Cebu',
  'Myanmar', 'Yangon', 'Cambodia', 'Phnom Penh', 'Laos', 'Vientiane', 'Brunei',
]

// Places people often type that are clearly not in a given region list. Anything else is kept: a location
// is free text, and "Earth" or "building in public" says nothing about where someone is.
const PLACES = [
  'United States', 'USA', 'US', 'America', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru',
  'United Kingdom', 'UK', 'England', 'Scotland', 'Ireland', 'France', 'Germany', 'Spain', 'Portugal', 'Italy',
  'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Romania',
  'Ukraine', 'Russia', 'Turkey', 'Greece', 'Israel', 'UAE', 'Dubai', 'Abu Dhabi', 'Saudi Arabia', 'Qatar', 'Egypt',
  'Nigeria', 'Kenya', 'Ghana', 'South Africa', 'Morocco', 'Ethiopia',
  'India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'China', 'Hong Kong', 'Taiwan', 'Japan', 'Korea',
  'Australia', 'New Zealand',
  'San Francisco', 'SF', 'Bay Area', 'Silicon Valley', 'New York', 'NYC', 'Los Angeles', 'Seattle', 'Boston',
  'Austin', 'Chicago', 'Miami', 'Toronto', 'Vancouver', 'London', 'Paris', 'Berlin', 'Munich', 'Amsterdam',
  'Zurich', 'Stockholm', 'Lisbon', 'Madrid', 'Barcelona', 'Tel Aviv', 'Lagos', 'Nairobi', 'Cape Town',
  'Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Beijing', 'Shanghai', 'Shenzhen',
  'Taipei', 'Tokyo', 'Seoul', 'Sydney', 'Melbourne',
  'CA', 'NY', 'TX', 'WA', 'MA', 'FL',
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Short codes (SG, US, CA) only count in capitals, so "us" or "ca" inside a phrase do not.
const pattern = (place: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(place)}(?![\\p{L}\\p{N}])`, place.length <= 3 ? 'u' : 'iu')
const names = (place: string, location: string) => pattern(place).test(location)

// True only when the profile location names a known place and none of the regions.
export function outsideRegions(location: string | null, regions: string[]): boolean {
  if (!location || !regions.length) return false
  if (regions.some((r) => names(r, location))) return false
  return PLACES.some((p) => names(p, location))
}
