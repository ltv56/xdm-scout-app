import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Overview shows the funnel with counts and money per lane', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/funnel*', (r) =>
    r.fulfill({
      json: {
        totalMicros: 150_000,
        llmMicros: 30_000,
        llmUnpriced: true,
        lanes: [
          { lane: 'search', found: 40, goodFit: 12, approved: 9, sent: 8, replied: 3, conversations: 2, costMicros: 100_000, llmCostMicros: 20_000, llmUnpriced: false, costPerConversationMicros: 60_000 },
          { lane: 'call', found: 4, goodFit: 4, approved: 4, sent: 3, replied: 3, conversations: 0, costMicros: 20_000, llmCostMicros: 10_000, llmUnpriced: true, costPerConversationMicros: null },
        ],
      },
    }),
  )
  await page.goto('/')

  // Overview: how far people got, as five big numbers summed over both lanes. No money here.
  const results = page.getByRole('region', { name: 'Results so far' })
  const tile = (label: string) => results.getByRole('listitem').filter({ hasText: label })
  await expect(tile('Found')).toContainText('44')
  await expect(tile('Strong or Possible')).toContainText('16')
  await expect(tile('Approved')).toContainText('13')
  await expect(tile('Sent')).toContainText('11')
  await expect(tile('Replied')).toContainText('6')
  await expect(results).not.toContainText('X cost')
  await expect(results).not.toContainText('Model cost')
  await expect(page.getByText('Spent')).toBeVisible()

  // Settings: the money, per lane.
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Cost' }).click()
  const cost = page.getByRole('region', { name: 'Cost' })
  await expect(cost).toContainText('Found by search')
  await expect(cost).toContainText('Answered the call post')
  await expect(cost.getByRole('row', { name: /Per conversation/ })).toContainText('$0.06')
  await expect(cost.getByRole('row', { name: /Per conversation/ })).toContainText('–')
  await expect(cost.getByRole('row', { name: /^X cost/ })).toContainText('$0.10')
  await expect(cost.getByRole('row', { name: /^Model cost/ })).toContainText('$0.02')
  await expect(cost.getByRole('row', { name: /^Model cost/ })).toContainText('no price yet')
  await expect(cost.getByRole('row', { name: /^Model cost/ })).not.toContainText('$0.01')
  await expect(cost).toContainText('$0.15 so far, both together, not counting model calls with no price yet')
})

test('Overview shows no results block while nothing has been found', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/funnel*', (r) =>
    r.fulfill({
      json: {
        totalMicros: 0,
        llmMicros: 0,
        llmUnpriced: false,
        lanes: [{ lane: 'search', found: 0, goodFit: 0, approved: 0, sent: 0, replied: 0, conversations: 0, costMicros: 0, llmCostMicros: 0, llmUnpriced: false, costPerConversationMicros: null }],
      },
    }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Results so far' })).toHaveCount(0)
})
