import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('When the budget stopped the search before their posts, the detail reads them after a cost confirm and offers to score again', async ({ page, request }) => {
  await ensureCampaign(request)
  // Posts are kept per person across campaigns and other tests read them, so the first answers say they were not read.
  const notRead = { noOpening: { cause: 'posts_not_read', date: null }, opening: null }
  await page.route('**/api/campaigns/*/prospects', async (route) => {
    const response = await route.fetch()
    const people = await response.json()
    await route.fulfill({ response, json: people.map((p: object, i: number) => (i === 0 ? { ...p, ...notRead } : p)) })
  })
  let firstDetail = true
  await page.route('**/api/campaigns/*/prospects/*', async (route) => {
    if (route.request().method() !== 'GET' || !firstDetail) return route.continue()
    firstDetail = false
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), ...notRead, posts: [] } })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Candidates' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'posts not read' }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.getByRole('button', { name: /^See why|^Details/ }).click()

  const detail = page.getByRole('dialog')
  await expect(detail.getByText('Their posts were not read: the search reached its budget first.').first()).toBeVisible()
  await detail.getByRole('button', { name: 'Read their posts' }).click()
  await expect(detail.getByText(/Costs up to \$0\.08/)).toBeVisible()
  await detail.getByRole('button', { name: 'Read posts', exact: true }).click()
  await expect(detail.getByText(/^Read \d+ posts? for \$\d+\.\d\d\. Campaign spend \$\d+\.\d\d of \$\d+\.\d\d\.$/)).toBeVisible()

  await detail.getByRole('button', { name: 'Score again · under $0.01' }).click()
  await expect(detail.getByText('Scoring again. This screen updates when it is done.')).toBeVisible()
})
