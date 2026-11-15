import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDataSource } from '../test/db'
import { ReviewSignal } from './review-signal.entity'
import { ReviewSummaryService } from './review-summary.service'

let ds: DataSource

beforeEach(async () => {
  ds = await createTestDataSource()
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const signal = (s: Partial<ReviewSignal>) => ds.getRepository(ReviewSignal).save({ action: 'skip', reason: null, note: null, originalText: 'Hi', finalText: null, campaignId: 1, ...s })

describe('ReviewSummaryService', () => {
  it('counts approvals, edited approvals and skips by reason for one campaign', async () => {
    await signal({ action: 'approve', finalText: 'Hi' })
    await signal({ action: 'approve', finalText: 'Hi, edited' })
    await signal({ action: 'skip', reason: 'weak_opening' })
    await signal({ action: 'skip', reason: 'weak_opening' })
    await signal({ action: 'dismiss', reason: 'not_fit', originalText: '' })
    await signal({ action: 'skip', reason: 'wrong_tone', campaignId: 2 })
    expect(await new ReviewSummaryService(ds).get(1)).toEqual({
      approved: 2,
      edited: 1,
      skipped: [
        { reason: 'weak_opening', count: 2 },
        { reason: 'not_fit', count: 1 },
      ],
    })
  })

  it('is empty before the first review', async () => {
    expect(await new ReviewSummaryService(ds).get(1)).toEqual({ approved: 0, edited: 0, skipped: [] })
  })
})
