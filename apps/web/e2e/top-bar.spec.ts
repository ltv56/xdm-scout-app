import { expect, test } from '@playwright/test'

test('The top bar says Sandbox and how many went out today', async ({ page }) => {
  await page.goto('/')
  const bar = page.getByLabel('Status')
  await expect(bar).toContainText('SANDBOX')
  await expect(bar).toContainText('Sent today')
})

test('The top bar shows the cost of the open campaign and warns when the worker stopped', async ({ page }) => {
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'live', sentToday: 3, dailyCap: 25, workerRunning: false, campaignCostMicros: 40000 } }))
  await page.goto('/')
  const bar = page.getByLabel('Status')
  await expect(bar).toContainText('LIVE')
  await expect(bar).toContainText('Sent today 3 / 25')
  await expect(bar).toContainText('Est. cost $0.04')
  await expect(page.getByText('Worker stopped: nothing is being sent or read')).toBeVisible()
})

test('The top bar says a model has no price yet instead of showing it as free', async ({ page }) => {
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 0, dailyCap: 25, workerRunning: true, campaignCostMicros: 40000, llmUnpriced: true } }))
  await page.goto('/')
  await expect(page.getByLabel('Status')).toContainText('Est. cost $0.04 · model: no price yet')
})
