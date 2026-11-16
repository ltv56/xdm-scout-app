import { expect, test } from '@playwright/test'
import { CAMPAIGN, ensureCampaign } from './setup.ts'

test('A reload keeps the campaign, the page and the Messages tab', async ({ page, request }) => {
  await ensureCampaign(request)
  // A newer campaign, so the demo one is not the default a reload would fall back to.
  expect((await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `newer ${Date.now()}` } })).ok()).toBe(true)
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: CAMPAIGN.name, exact: true }).click()
  const nav = page.getByRole('navigation', { name: 'Sections' })

  await nav.getByRole('button', { name: 'Candidates' }).click()
  await page.reload()
  await expect(nav.getByRole('button', { name: 'Candidates' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: /^Campaign/ })).toContainText(CAMPAIGN.name)

  await nav.getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Outbox' })).toHaveAttribute('aria-selected', 'true')
})
