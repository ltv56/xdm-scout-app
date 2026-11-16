import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Inbox and Outbox are one menu item, Messages, with a tab each', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/outbox*', (r) => r.fulfill({ json: { inFlight: false, items: [{ attemptId: 1, handle: 'mina_builds', label: 'Sent', route: 'api', error: null, at: '2026-11-15T10:00:00Z' }] } }))
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  const nav = page.getByRole('navigation', { name: 'Sections' })

  await expect(nav.getByRole('button', { name: 'Messages' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Inbox' })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Outbox' })).toHaveCount(0)

  await nav.getByRole('button', { name: 'Messages' }).click()
  await expect(nav.getByRole('button', { name: 'Messages' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('tablist', { name: 'Messages' }).getByRole('tab')).toHaveText(['Inbox', 'Outbox'])
  await expect(page.getByRole('tab', { name: 'Inbox' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: 'Outbox' }).click()
  await expect(page.getByRole('tab', { name: 'Outbox' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('@mina_builds')
})

test('The tab you left Messages on is still open when you come back, and arrow keys switch tabs', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  const nav = page.getByRole('navigation', { name: 'Sections' })

  await nav.getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Inbox' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Outbox' })).toHaveAttribute('aria-selected', 'true')
  await nav.getByRole('button', { name: 'Candidates' }).click()
  await nav.getByRole('button', { name: 'Messages' }).click()
  await expect(page.getByRole('tab', { name: 'Outbox' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Outbox' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Inbox' })).toHaveAttribute('aria-selected', 'true')
})
