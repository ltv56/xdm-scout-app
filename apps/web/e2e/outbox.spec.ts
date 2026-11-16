import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

const item = (attemptId: number, handle: string, label: string, error: string | null = null) => ({ attemptId, handle, label, route: 'api', error, at: '2026-11-15T10:00:00Z' })

test('Outbox lists the sends with their state and refreshes faster while one is on its way', async ({ page, request }) => {
  await ensureCampaign(request)
  let calls = 0
  await page.route('**/api/outbox*', (r) => {
    calls += 1
    return r.fulfill({ json: { inFlight: true, items: [item(2, 'mina_builds', 'Sending'), item(1, 'old_friend', 'Failed', 'X said no')] } })
  })
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 3, dailyCap: 25, workerRunning: true, campaignCostMicros: null, llmUnpriced: false } }))
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()
  await expect(page.getByRole('region', { name: 'Outbox' })).toContainText('Sent today 3 of 25')
  await expect(page.getByText('@mina_builds')).toBeVisible()
  await expect(page.getByText('Sending')).toBeVisible()
  await expect(page.getByText('X said no')).toBeVisible()
  await expect.poll(() => calls, { timeout: 12_000 }).toBeGreaterThan(1)
})
