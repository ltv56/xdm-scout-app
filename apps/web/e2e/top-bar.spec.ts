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

test('The top bar leaves the cost out and warns when the worker stopped', async ({ page }) => {
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'live', sentToday: 3, dailyCap: 25, workerRunning: false, campaignCostMicros: 40000 } }))
  await page.goto('/')
  const bar = page.getByLabel('Status')
  await expect(bar).toContainText('LIVE')
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

test('The top bar stays on one row at a laptop width even with the longest warnings', async ({ page }) => {
  await page.setViewportSize({ width: 1291, height: 720 })
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 0, dailyCap: 25, workerRunning: false, campaignCostMicros: 80000, llmUnpriced: true } }))
  await page.goto('/')
  await expect(page.getByLabel('Status')).toContainText('Worker stopped')
  const nav = (await page.getByRole('button', { name: 'Overview' }).boundingBox())!
  const account = (await page.getByRole('button', { name: 'Account', exact: true }).boundingBox())!
  expect(Math.abs(nav.y + nav.height / 2 - (account.y + account.height / 2))).toBeLessThan(30)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
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

test('A very long campaign name is cut short and does not push the top bar onto several lines', async ({ page, request }) => {
  expect((await request.post('/api/campaigns', { data: { name: 'a'.repeat(120), keywords: ['robotics'], handles: ['mina_builds'] } })).ok()).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const header = page.locator('header:visible').first()
  await expect(header.getByText('xdm-scout', { exact: true })).toBeVisible()
  expect((await header.getByText('xdm-scout', { exact: true }).boundingBox())!.height).toBeLessThan(30)
  const tops = await header.getByRole('navigation', { name: 'Sections' }).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  expect((await header.boundingBox())!.height).toBeLessThan(90)
})
