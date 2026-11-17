import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { pick } from './pick.ts'
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

// A campaign of its own, so dismissing someone here does not change what other specs see.
async function openCandidates(page: Page, request: APIRequestContext) {
  await ensureReady(request)
  const { id } = await (await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `rows ${Date.now()}` } })).json()
  await waitForScoredPeople(request, id)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Candidates' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Tomas Reyes' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  return row
}

test('A candidate shows who they are, what to do and why in one line, and keeps the evidence one click away', async ({ page, request }) => {
  const row = await openCandidates(page, request)
  await expect(row.getByRole('button', { name: 'Tomas Reyes', exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Draft a message' })).toBeVisible()
  await expect(row.getByText(/followers/)).toBeVisible()
  await expect(row.getByRole('note')).toHaveCount(0)
  await expect(row.getByText(/^Opening/)).toBeVisible()
  await expect(row.getByText('Mainly because:')).toBeVisible()
  await expect(row.getByRole('button', { name: /^See why/ })).toBeVisible()
})

test('The detail says why each label is there, and Back returns to the same place', async ({ page, request }) => {
  const row = await openCandidates(page, request)
  const name = row.getByRole('button', { name: 'Tomas Reyes', exact: true })
  await name.click()
  const detail = page.getByRole('dialog', { name: 'Tomas Reyes' })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: /^Why (Strong|Possible) fit$/ })).toBeVisible()
  await expect(detail.getByText('Mainly because:')).toBeVisible()
  // Every label has an (i) that explains it on hover, focus or tap.
  const tip = detail.getByRole('button', { name: 'About Backed by evidence: A post, bio or profile line it cites says this.' }).first()
  await tip.hover()
  await expect(page.getByRole('tooltip')).toContainText('A post, bio or profile line it cites says this.')
  await expect(detail.getByRole('button', { name: /^About Fit:/ })).toBeVisible()
  await expect(detail.getByRole('button', { name: /^About Opening:/ })).toBeVisible()
  for (const section of ['Profile', 'Reaching out', 'Posts read']) {
    await expect(detail.getByRole('heading', { name: section })).toBeVisible()
  }
  await expect(detail.getByText('Likely lands in')).toBeVisible()
  await expect(detail.getByText(/^(They |X )/).first()).toBeVisible()

  await detail.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(detail).toHaveCount(0)
  await expect(name).toBeFocused()

  await row.getByRole('button', { name: /^See why/ }).click()
  await expect(page.getByRole('dialog', { name: 'Tomas Reyes' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Tomas Reyes' })).toHaveCount(0)
})

test('Dismiss is out of the way: behind a menu button, with a confirmation, and Cancel or Escape leaves the person alone', async ({ page, request }) => {
  const row = await openCandidates(page, request)
  await expect(row.getByRole('button', { name: 'Dismiss' })).toHaveCount(0)

  const more = row.getByRole('button', { name: 'More actions for Tomas Reyes' })
  await more.click()
  const confirm = page.getByRole('dialog', { name: 'Dismiss Tomas Reyes' })
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('stay in All')

  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  await more.click()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(row.getByText('Dismissed')).toHaveCount(0)

  await more.click()
  await pick(page, confirm.getByRole('combobox', { name: 'Reason' }), 'Weak opening')
  await confirm.getByRole('button', { name: 'Dismiss' }).click()
  await expect(row.getByText('Dismissed')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Draft a message' })).toHaveCount(0)
})

test('A person already in the Outbox says so instead of offering a draft', async ({ page, request }) => {
  await page.route('**/api/campaigns/*/prospects', async (route) => {
    const response = await route.fetch()
    const people = await response.json()
    for (const p of people) if (p.handle === 'tomas_agents') p.outbox = 'Send in X'
    await route.fulfill({ response, json: people })
  })
  const row = await openCandidates(page, request)
  await expect(row.getByText('In Outbox · Send in X')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Draft a message' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Open in Review' })).toHaveCount(0)
})
