import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Results so far says how many approved drafts were edited and what was skipped, and why', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/review-summary*', (r) =>
    r.fulfill({ json: { approved: 9, edited: 4, skipped: [{ reason: 'weak_opening', count: 3 }, { reason: 'not_fit', count: 1 }] } }),
  )
  await page.goto('/')
  const section = page.getByRole('region', { name: 'Results so far' })
  await expect(section).toContainText('4 approved drafts were edited first')
  await expect(section).toContainText('Skipped 4: Weak opening 3, Not a fit 1')
})
