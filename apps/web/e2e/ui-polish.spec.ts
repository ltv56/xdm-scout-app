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
