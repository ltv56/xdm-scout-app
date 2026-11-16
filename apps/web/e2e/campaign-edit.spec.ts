import { expect, test, type Locator, type Page } from '@playwright/test'
import { CAMPAIGN, ensureReady } from './setup.ts'

// The newest campaign is the one the app opens, so each test makes its own.
let name: string
let id: number

test.beforeEach(async ({ page, request }) => {
  await ensureReady(request)
  name = `edit ${Date.now()}`
  const created = await (await request.post('/api/campaigns', { data: { ...CAMPAIGN, name, keywords: ['robotics'], handles: ['mina_builds'] } })).json()
  id = created.id
  await page.goto('/')
})

// Types each item into a tag box, one Enter per item.
async function add(box: Locator, ...items: string[]) {
  for (const item of items) {
    await box.fill(item)
    await box.press('Enter')
  }
}

const tags = (form: Locator, label: string) => form.getByRole('list', { name: `${label} (added)` }).getByRole('listitem')

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
  return page.getByRole('region', { name: 'Campaign' })
}

test('Settings: the campaign can be renamed and its search changed, and the Overview shows it', async ({ page, request }) => {
  const form = await openSettings(page)
  await expect(form.getByLabel('Name')).toHaveValue(name)
  await expect(tags(form, 'Keywords')).toHaveText(['robotics×'])

  const renamed = `${name} renamed`
  await form.getByLabel('Name').fill(renamed)
  await form.getByRole('button', { name: 'Remove robotics' }).click()
  await add(form.getByLabel('Keywords', { exact: true }), 'agents', 'llm')
  await add(form.getByLabel('Handles', { exact: true }), '@Mina_Builds', 'Tomas_Agents')
  await form.getByLabel('Discovery budget in USD').fill('2.5')
  await form.getByRole('button', { name: 'Save campaign' }).click()

  await expect(form.getByRole('status')).toContainText('Saved')
  await expect(tags(form, 'Handles')).toHaveText(['mina_builds×', 'tomas_agents×'])
  expect(await (await request.get(`/api/campaigns/${id}`)).json()).toMatchObject({ name: renamed, keywords: ['agents', 'llm'], handles: ['mina_builds', 'tomas_agents'], budgetMicros: 2_500_000 })

  await expect(page.getByRole('button', { name: `Campaign ${renamed}` })).toBeVisible()
  await page.getByRole('button', { name: 'Overview' }).click()
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible()
})

test('Settings: a campaign with no keyword or no source is refused', async ({ page, request }) => {
  const form = await openSettings(page)

  await form.getByRole('button', { name: 'Remove robotics' }).click()
  await form.getByRole('button', { name: 'Save campaign' }).click()
  await expect(form.getByRole('alert')).toHaveText('Add at least one keyword.')

  await add(form.getByLabel('Keywords', { exact: true }), 'robotics')
  await form.getByRole('button', { name: 'Remove mina_builds' }).click()
  await form.getByRole('button', { name: 'Save campaign' }).click()
  await expect(form.getByRole('alert')).toHaveText('Add at least one handle, seed account or search query.')
  expect(await (await request.get(`/api/campaigns/${id}`)).json()).toMatchObject({ keywords: ['robotics'], handles: ['mina_builds'] })
})

test('Settings: the reason the server gives for a refused save is shown and nothing is reported as saved', async ({ page }) => {
  const form = await openSettings(page)
  await page.route('**/api/campaigns/*', (r) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 400, json: { message: 'Seed accounts: at most 10' } }) : r.fallback()))

  await add(form.getByLabel('Handles', { exact: true }), 'lena_embodied')
  await form.getByRole('button', { name: 'Save campaign' }).click()
  await expect(form.getByRole('alert')).toHaveText('Seed accounts: at most 10')
  await expect(form.getByRole('status')).toHaveCount(0)
})

test('Settings: Save is off until something changes, and off again once saved', async ({ page }) => {
  const form = await openSettings(page)
  const save = form.getByRole('button', { name: 'Save campaign' })
  await expect(save).toBeDisabled()

  await form.getByLabel('Discovery budget in USD').fill('3')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(form.getByRole('status')).toContainText('Saved')
  await expect(save).toBeDisabled()

  await form.getByLabel('Name').fill('changed again')
  await expect(form.getByRole('status')).toHaveCount(0)
  await expect(save).toBeEnabled()
})
