import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Overview: a search stopped by the budget says what it spent, reads the posts of everyone waiting after a cost confirm, then offers to score them again', async ({ page, request }) => {
  const id = await ensureCampaign(request)
  await page.route(`**/api/campaigns/${id}`, async (route) => {
    const response = await route.fetch()
    const c = await response.json()
    const lastDiscovery = { ...(c.lastDiscovery ?? {}), at: new Date().toISOString(), added: 3, addedHandles: [], seeds: [], skipped: [], spentMicros: 980_000, stoppedByBudget: true, postsPending: 2 }
    await route.fulfill({ response, json: { ...c, budgetMicros: 1_000_000, lastDiscovery } })
  })
  // The real read depends on who other tests already read; its answer is given, the request it gets is checked.
  let readBody: unknown
  await page.route(`**/api/campaigns/${id}/read-posts`, async (route) => {
    readBody = route.request().postDataJSON()
    await route.fulfill({ json: { people: 2, posts: 3, prospectIds: [1, 2], costMicros: 10_000, spentMicros: 990_000, budgetMicros: 1_130_000 } })
  })
  let scoreBody: unknown
  await page.route(`**/api/campaigns/${id}/score`, async (route) => {
    scoreBody = route.request().postDataJSON()
    await route.fulfill({ json: { queued: 2 } })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  const note = page.getByRole('region', { name: 'Last search' }).getByRole('note')
  await expect(note).toContainText('The search stopped at the budget: spent $0.98 of $1.00.')
  await expect(note).toContainText('2 people found but not read yet')
  await expect(note.getByRole('button', { name: 'Go to Candidates' })).toBeVisible()
  await note.getByRole('button', { name: 'Read posts for all 2' }).click()
  await expect(note).toContainText('Costs up to $0.15.')
  await note.getByRole('button', { name: 'Read posts', exact: true }).click()
  await expect(note.getByRole('status')).toContainText('Read 3 posts from 2 people for $0.01. Campaign spend $0.99 of $1.13.')
  expect(readBody).toEqual({ raiseBudget: true })

  await note.getByRole('button', { name: 'Score them again · under $0.02' }).click()
  await expect(note).toContainText('Scoring 2 people again.')
  expect(scoreBody).toEqual({ prospectIds: [1, 2] })
})
