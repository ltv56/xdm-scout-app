import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { CAMPAIGN, ensureReady } from './setup.ts'

async function waitForScoredPeople(request: APIRequestContext, id: number) {
  await expect(async () => {
    const people = await (await request.get(`/api/campaigns/${id}/prospects`)).json()
    if (people.length === 0) {
      await request.post(`/api/campaigns/${id}/discover`)
      throw new Error('discovery not finished')
    }
    if (people.some((p: { fit: string | null }) => p.fit === null)) {
      await request.post(`/api/campaigns/${id}/score`)
      throw new Error('scoring not finished')
    }
  }).toPass({ timeout: 60_000, intervals: [2_000] })
}

async function openCandidates(page: Page, request: APIRequestContext) {
  await ensureReady(request)
  const { id } = await (await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `polish ${Date.now()}` } })).json()
  await waitForScoredPeople(request, id)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Candidates' }).click()
  await expect(candidate(page)).toBeVisible({ timeout: 20_000 })
}

// Whoever is first in the list: people another spec dismissed are skipped by discovery.
const candidate = (page: Page) => page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Draft a message' }) }).first()

test('Source and bio links are the X mark with a name, not underlined words', async ({ page, request }) => {
  await openCandidates(page, request)
  const row = candidate(page)
  await expect(row.getByRole('link', { name: 'Open the post on X' })).toBeVisible()
  await expect(row.getByText('source', { exact: true })).toHaveCount(0)
  await row.getByText(/^Why this fit/).click()
  await expect(row.getByRole('link', { name: 'Open their bio on X' })).toBeVisible()
  await expect(row.getByText('bio', { exact: true })).toHaveCount(0)
})

test('Dropdowns and their lists are drawn by the app, and work from the keyboard', async ({ page, request }) => {
  await openCandidates(page, request)
  await expect(page.locator('select')).toHaveCount(0)

  const sort = page.getByRole('combobox', { name: 'Sort by' })
  await sort.click()
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible()
  await expect(list.getByRole('option')).toHaveCount(6)
  await expect(list.getByRole('option', { name: 'Best fit first' })).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(list).toHaveCount(0)
  await expect(sort).toContainText('Relationship')

  await sort.click()
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(sort).toContainText('Relationship')
})

test('Hints are the app\'s own bubbles, not the browser\'s', async ({ page, request }) => {
  await openCandidates(page, request)
  const hint = page.getByText('Likely lands in', { exact: true }).first()
  await hint.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('A guess from whether they follow you')
  expect(await hint.getAttribute('title')).toBeNull()

  await page.mouse.move(2, 2)
  await expect(tip).toHaveCount(0)
  expect(await hint.getAttribute('title')).toContain('A guess from whether they follow you')
})

