import { describe, expect, it } from 'vitest'
import { outsideRegions, SEA_REGIONS } from './regions'

describe('outsideRegions', () => {
  it('keeps a location that names one of the regions', () => {
    expect(outsideRegions('Singapore', SEA_REGIONS)).toBe(false)
    expect(outsideRegions('Petaling, Selangor', SEA_REGIONS)).toBe(false)
    expect(outsideRegions('Ho Chi Minh City, Viet Nam', SEA_REGIONS)).toBe(false)
    expect(outsideRegions('SF ↔ Jakarta', SEA_REGIONS)).toBe(false)
  })

  it('skips a location that clearly names a place outside them', () => {
    expect(outsideRegions('Berlin, Germany', SEA_REGIONS)).toBe(true)
    expect(outsideRegions('San Francisco, CA', SEA_REGIONS)).toBe(true)
    expect(outsideRegions('Bengaluru, India', SEA_REGIONS)).toBe(true)
    expect(outsideRegions('Hong Kong SAR', SEA_REGIONS)).toBe(true)
  })

  it('keeps a location it cannot place, and an empty one', () => {
    expect(outsideRegions('Building in public', SEA_REGIONS)).toBe(false)
    expect(outsideRegions('Earth', SEA_REGIONS)).toBe(false)
    expect(outsideRegions(null, SEA_REGIONS)).toBe(false)
  })

  it('filters nothing without regions', () => {
    expect(outsideRegions('Berlin, Germany', [])).toBe(false)
  })
})
