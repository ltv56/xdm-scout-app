import { expect, test } from '@playwright/test'
import { CAMPAIGN, ensureReady } from './setup.ts'

test('A search scores the people it finds by itself, and the Overview writes their drafts', async ({ page, request }) => {
  await ensureReady(request)
  const { id } = await (await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `actions ${Date.now()}` } })).json()
  // Only the search is asked for; scoring follows without another request.
  expect((await request.post(`/api/campaigns/${id}/discover`)).ok()).toBe(true)
  await expect(async () => {
    const people = await (await request.get(`/api/campaigns/${id}/prospects`)).json()
    expect(people.length).toBeGreaterThan(0)
    expect(people.every((p: { fit: string | null }) => p.fit !== null)).toBe(true)
  }).toPass({ timeout: 60_000, intervals: [2_000] })

  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: new RegExp(`^actions `) }).last().click()
  const card = page.getByRole('region', { name: 'Next step' })
  await expect(card).toContainText(/ready for a draft/)
  await expect(card.getByRole('button', { name: /^Score \d+ (person|people)$/ })).toHaveCount(0)

  // Drafts are written in the background; the card follows them to Review without a reload.
  await card.getByRole('button', { name: /^Write \d+ drafts?$/ }).click()
  await expect(card).toContainText(/waiting for your review/, { timeout: 30_000 })
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Candidates' }).click()
  await expect(page.getByRole('button', { name: /^Drafted [1-9]/ })).toBeVisible()
})
