import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Overview shows the funnel with counts and money per lane', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/funnel*', (r) =>
    r.fulfill({
      json: {
        totalMicros: 150_000,
        llmMicros: 30_000,
        lanes: [
          { lane: 'search', found: 40, goodFit: 12, approved: 9, sent: 8, replied: 3, conversations: 2, costMicros: 100_000, llmCostMicros: 20_000, costPerConversationMicros: 60_000 },
          { lane: 'call', found: 4, goodFit: 4, approved: 4, sent: 3, replied: 3, conversations: 0, costMicros: 20_000, llmCostMicros: 10_000, costPerConversationMicros: null },
        ],
      },
    }),
  )
  await page.goto('/')
  const section = page.getByRole('region', { name: 'Results so far' })
  await expect(section).toContainText('Found by search')
  await expect(section).toContainText('Answered the call post')
  await expect(section.getByRole('row', { name: /Strong or Possible/ })).toContainText('12')
  await expect(section.getByRole('row', { name: /Approved/ })).toContainText('9')
  await expect(section.getByRole('row', { name: /Per conversation/ })).toContainText('$0.06')
  await expect(section.getByRole('row', { name: /Per conversation/ })).toContainText('–')
  await expect(section.getByRole('row', { name: /^X cost/ })).toContainText('$0.10')
  await expect(section.getByRole('row', { name: /^Model cost/ })).toContainText('$0.02')
  await expect(section.getByRole('row', { name: /^Model cost/ })).toContainText('$0.01')
  await expect(section).toContainText('$0.15 so far')
})
