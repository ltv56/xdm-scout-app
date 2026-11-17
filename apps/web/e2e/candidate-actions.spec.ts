import { expect, test } from '@playwright/test'
import { CAMPAIGN, ensureReady } from './setup.ts'

test('People are scored one by one in Candidates or all at once from the Overview, and drafted from Candidates', async ({ page, request }) => {
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

  // Overview offers to score the new people, and the way to Candidates.
  const card = page.getByRole('region', { name: 'Next step' })
  await expect(card).toContainText('not scored yet')
  await expect(card.getByRole('button', { name: /^Score \d+ (person|people)$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Write \d+ drafts?$/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'View candidates' }).click()

  // One person.
  const unscored = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Score', exact: true }) })
  const who = (await unscored.first().getByRole('link').first().innerText()).trim()
  const first = page.getByRole('listitem').filter({ hasText: who })
  await first.getByRole('button', { name: 'Score', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Draft a message' })).toBeVisible({ timeout: 30_000 })

  // Everyone else at once, from the Overview.
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Overview' }).click()
  await card.getByRole('button', { name: /^Score \d+ (person|people)$/ }).click()
  await expect(card).not.toContainText('not scored yet', { timeout: 30_000 })
  // Once scored, the Overview offers the drafts without a reload.
  await expect(card).toContainText(/ready for a draft/, { timeout: 10_000 })
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Candidates' }).click()
  await expect(page.getByRole('button', { name: 'Score', exact: true })).toHaveCount(0)

  // Drafts for everyone who is ready.
  // Drafts are written in the background: the page says so, then shows them as drafted without a reload.
  await page.getByRole('button', { name: /^Write \d+ drafts?$/ }).click()
  await expect(page.getByText(/^Writing \d+ drafts?\./)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Drafted [1-9]/ })).toBeVisible({ timeout: 30_000 })
})
