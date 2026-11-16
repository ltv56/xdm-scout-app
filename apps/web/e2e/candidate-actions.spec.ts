import { expect, test } from '@playwright/test'
import { CAMPAIGN, ensureReady } from './setup.ts'

test('Scoring and drafting are done from Candidates, one by one or all at once; Overview only points there', async ({ page, request }) => {
  await ensureReady(request)
  const { id } = await (await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `actions ${Date.now()}` } })).json()
  // Find people but do not score them.
  await expect(async () => {
    const people = await (await request.get(`/api/campaigns/${id}/prospects`)).json()
    if (people.length === 0) {
      await request.post(`/api/campaigns/${id}/discover`)
      throw new Error('discovery not finished')
    }
  }).toPass({ timeout: 60_000, intervals: [2_000] })
  await page.goto('/')

  // Overview has no scoring or drafting buttons, only the way to Candidates.
  const card = page.getByRole('region', { name: 'Next step' })
  await expect(card).toContainText('not scored yet')
  await expect(page.getByRole('button', { name: /^Score/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Write drafts/ })).toHaveCount(0)
  await card.getByRole('button', { name: 'Go to Candidates' }).click()

  // One person.
  const unscored = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Score', exact: true }) })
  const who = (await unscored.first().getByRole('link').first().innerText()).trim()
  const first = page.getByRole('listitem').filter({ hasText: who })
  await first.getByRole('button', { name: 'Score', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Draft a message' })).toBeVisible({ timeout: 30_000 })

  // Everyone else at once.
  const all = page.getByRole('button', { name: /^Score all/ })
  if (await all.count()) await all.click()
  await expect(page.getByRole('button', { name: /^Score all/ })).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Score', exact: true })).toHaveCount(0)

  // Drafts for everyone who is ready.
  await page.getByRole('button', { name: /^Write drafts/ }).click()
  await expect(page.getByText(/^Wrote \d+ drafts?\./)).toBeVisible({ timeout: 30_000 })
})
