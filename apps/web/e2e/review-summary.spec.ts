import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Overview says how many drafts were approved, edited and skipped, and why', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/review-summary*', (r) =>
    r.fulfill({ json: { approved: 9, edited: 4, skipped: [{ reason: 'weak_opening', count: 3 }, { reason: 'not_fit', count: 1 }] } }),
  )
  await page.goto('/')
  const section = page.getByRole('region', { name: 'What reviewers changed' })
  await expect(section).toContainText('Approved 9')
  await expect(section).toContainText('4 drafts edited first')
  await expect(section).toContainText('Skipped 4')
  await expect(section).toContainText('Weak opening 3, Not a fit 1')
})
