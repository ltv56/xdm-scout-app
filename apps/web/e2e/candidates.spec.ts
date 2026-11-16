import { expect, test } from '@playwright/test'
import { pick } from './pick.ts'
import { ensureCampaign } from './setup.ts'

test.beforeEach(async ({ page, request }) => {
  await ensureCampaign(request)
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Candidates' }).click()
})

test('Candidates: people are listed and the tabs filter them', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('3 candidates shown')

  await page.getByRole('button', { name: /^Not a fit/ }).click()
  await expect(page.getByText('Nobody in this list.')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('0 candidates shown')

  await page.getByRole('button', { name: /^Ready for a draft/ }).click()
  await expect(page.getByRole('status')).toHaveText('3 candidates shown')
})

test('Candidates: filtering by relationship and sorting by followers', async ({ page }) => {
  const names = page.getByRole('listitem').getByRole('link', { name: /@/ }).filter({ hasText: /^[^@]/ })

  await pick(page, page.getByRole('combobox', { name: 'Sort by' }), 'Followers')
  await page.getByRole('button', { name: /^Sorted/ }).click()
  await expect(names.first()).toContainText('@tomas_agents')
  await page.getByRole('button', { name: /^Sorted/ }).click()
  await expect(names.first()).not.toContainText('@tomas_agents')

  await pick(page, page.getByRole('combobox', { name: 'Relationship' }), 'Messaged you first')
  await expect(page.getByText('Nobody in this list.')).toBeVisible()
  await pick(page, page.getByRole('combobox', { name: 'Relationship' }), 'Any relationship')
  await expect(page.getByRole('status')).toHaveText('3 candidates shown')
})

test('Candidates: five people a page, Next shows the following five, and a new filter starts at page one', async ({ page }) => {
  await page.route('**/api/campaigns/*/prospects', async (route) => {
    const response = await route.fetch()
    const people = await response.json()
    const many = Array.from({ length: 12 }, (_, n) => ({ ...people[n % people.length], id: 1000 + n, handle: `person_${n}`, name: `Person ${n}` }))
    await route.fulfill({ response, json: many })
  })
  await page.reload()
  await page.getByRole('navigation').getByRole('button', { name: 'Candidates' }).click()
  const names = page.getByRole('link', { name: /^Person \d+/ })
  await expect(page.getByRole('status')).toHaveText('12 candidates shown')
  await expect(names).toHaveCount(5)

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(names).toHaveCount(5)
  await expect(page.getByText('Page 2 of 3')).toBeVisible()

  await page.getByRole('button', { name: /^Ready for a draft/ }).click()
  await expect(page.getByText('Page 1 of 3')).toBeVisible()
})
