import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

// Live mode with the X app keys saved, answered by the spec: the e2e API runs on the fake X.
test.beforeEach(async ({ page, request }) => {
  await ensureCampaign(request)
  const ready = { set: true, last4: 'abcd', source: 'saved' }
  await page.route('**/api/keys', (r) => r.fulfill({ json: { keys: { xClientId: ready, xClientSecret: ready, openaiApiKey: ready }, callbackUrl: 'https://x.example/cb', canSave: true } }))
})

test('Connect X account opens the X login in its own window, and the app reads the account again when it reports back', async ({ page, context }) => {
  let statusReads = 0
  await page.route('**/api/auth/x/status', (r) => {
    statusReads += 1
    return r.fulfill({ json: { mode: 'live', connected: false, handle: null, tokenExpiresAt: null, missingScopes: [] } })
  })
  await context.route('**/api/auth/x/login', (r) => r.fulfill({ body: 'X login' }))
  await page.goto('/#profile')
  await expect(page.getByRole('link', { name: 'Connect X account' })).toBeVisible()
  const tabUrl = page.url()

  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Connect X account' }).click()])
  expect(new URL(popup.url()).pathname).toBe('/api/auth/x/login')
  expect(page.url()).toBe(tabUrl)

  const before = statusReads
  await page.evaluate(() => window.postMessage({ type: 'x-connected' }, window.location.origin))
  await expect.poll(() => statusReads).toBeGreaterThan(before)
})

test('Without a window to close, the end of the X login opens Profile in the app', async ({ page }) => {
  await page.goto('/x-connected.html')
  await expect(page).toHaveURL(/#(\d+\/)?profile$/)
  await expect(page.getByRole('main').getByRole('heading', { name: 'Profile', exact: true })).toBeVisible({ timeout: 15_000 })
})
