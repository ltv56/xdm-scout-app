import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Overview: a search stopped by the budget says so in a callout, with what it spent and what to do', async ({ page, request }) => {
  const id = await ensureCampaign(request)
  // Whether a real search hits the budget depends on what other tests already read, so the last search is given here.
  await page.route(`**/api/campaigns/${id}`, async (route) => {
    const response = await route.fetch()
    const c = await response.json()
    const lastDiscovery = { ...(c.lastDiscovery ?? {}), at: new Date().toISOString(), added: 3, addedHandles: [], seeds: [], skipped: [], spentMicros: 980_000, stoppedByBudget: true, postsPending: 2 }
    await route.fulfill({ response, json: { ...c, budgetMicros: 1_000_000, lastDiscovery } })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  const note = page.getByRole('region', { name: 'Last search' }).getByRole('note')
  await expect(note).toContainText('The search stopped at the budget: spent $0.98 of $1.00.')
  await expect(note).toContainText('2 people found but not read yet')
  await expect(note.getByRole('button', { name: 'Go to Candidates' })).toBeVisible()
})
