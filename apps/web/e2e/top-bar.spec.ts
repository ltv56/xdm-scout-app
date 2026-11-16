import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test.beforeEach(async ({ request }) => {
  await ensureCampaign(request)
})

test('The top bar says Sandbox and stays quiet about the daily cap while it is far off', async ({ page }) => {
  await page.goto('/')
  const bar = page.getByLabel('Status')
  await expect(bar).toContainText('SANDBOX')
  await expect(bar).not.toContainText('Sent today')
})

test('In live mode the top bar has no mode tag, leaves the cost out and warns when the worker stopped', async ({ page }) => {
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'live', sentToday: 3, dailyCap: 25, workerRunning: false, campaignCostMicros: 40000 } }))
  await page.goto('/')
  const bar = page.getByLabel('Status')
  await expect(bar).not.toContainText('LIVE')
  await expect(bar).not.toContainText('SANDBOX')
  await expect(bar).not.toContainText('Sent today')
  await expect(bar).not.toContainText('Est. cost')
  await expect(page.getByText('Worker stopped: nothing is being sent or read')).toBeVisible()
})

test('The top bar says a model has no price yet instead of showing it as free', async ({ page }) => {
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 0, dailyCap: 25, workerRunning: true, campaignCostMicros: 40000, llmUnpriced: true } }))
  await page.goto('/')
  await expect(page.getByLabel('Status')).toContainText('Model has no price yet')
  await expect(page.getByLabel('Status')).not.toContainText('Est. cost')
})

test('The top bar shows the daily cap once it is close, and says so when it is reached', async ({ page }) => {
  const bar = (sentToday: number) => ({ mode: 'fake', sentToday, dailyCap: 25, workerRunning: true, campaignCostMicros: null, llmUnpriced: false })
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: bar(20) }))
  await page.goto('/')
  await expect(page.getByLabel('Status')).toContainText('Sent today 20 / 25')

  await page.unroute('**/api/top-bar*')
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: bar(25) }))
  await page.reload()
  await expect(page.getByLabel('Status')).toContainText('Daily cap reached 25 / 25')
})

