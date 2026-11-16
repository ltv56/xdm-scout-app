import { expect, test, type Locator, type Page } from '@playwright/test'
import { CAMPAIGN, ensureReady } from './setup.ts'

let id: number

test.beforeEach(async ({ page, request }) => {
  await ensureReady(request)
  const created = await (await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `tags ${Date.now()}`, keywords: ['robotics'], handles: ['mina_builds'] } })).json()
  id = created.id
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
})

const form = (page: Page) => page.getByRole('region', { name: 'Campaign' })
const input = (page: Page, label: string) => form(page).getByLabel(label, { exact: true })
const tags = (page: Page, label: string) => form(page).getByRole('list', { name: `${label} (added)` }).getByRole('listitem')
const paste = (field: Locator, text: string) =>
  field.evaluate((el, value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)

test('Keywords show as tags; Enter or a comma adds one, x removes one, Backspace on an empty box removes the last', async ({ page }) => {
  await expect(tags(page, 'Keywords')).toHaveCount(1)
  await expect(tags(page, 'Keywords').first()).toContainText('robotics')

  const keywords = input(page, 'Keywords')
  await keywords.fill('agents')
  await keywords.press('Enter')
  await keywords.pressSequentially('llm,')
  await expect(tags(page, 'Keywords')).toHaveCount(3)
  await expect(keywords).toHaveValue('')
  await expect(form(page).getByRole('alert')).toHaveCount(0)

  await keywords.fill('agents')
  await keywords.press('Enter')
  await expect(tags(page, 'Keywords')).toHaveCount(3)

  await form(page).getByRole('button', { name: 'Remove agents' }).click()
  await expect(tags(page, 'Keywords')).toHaveCount(2)
  await expect(form(page).getByRole('button', { name: 'Remove agents' })).toHaveCount(0)

  await keywords.press('Backspace')
  await expect(tags(page, 'Keywords')).toHaveCount(1)
  await keywords.fill('typed')
  await keywords.press('Backspace')
  await expect(tags(page, 'Keywords')).toHaveCount(1)
  await expect(keywords).toHaveValue('type')
})

test('Pasting several lines makes one tag per line, and handles lose the @ and the capitals', async ({ page }) => {
  await paste(input(page, 'Keywords'), 'agents\n\n  llm  \nembodied, vision')
  await expect(tags(page, 'Keywords')).toHaveCount(5)
  await expect(tags(page, 'Keywords').nth(4)).toContainText('vision')

  await paste(input(page, 'Handles'), '@Tomas_Agents\n@MINA_builds\nlena_embodied')
  await expect(tags(page, 'Handles')).toHaveText(['mina_builds×', 'tomas_agents×', 'lena_embodied×'])
})

test('Seed accounts and Search queries stop at 10 and say so', async ({ page }) => {
  const seeds = input(page, 'Seed accounts')
  await paste(seeds, Array.from({ length: 12 }, (_, i) => `seed${i}`).join('\n'))
  await expect(tags(page, 'Seed accounts')).toHaveCount(10)
  await expect(seeds).toBeDisabled()
  await expect(form(page).getByText('Up to 10 seed accounts.')).toBeVisible()
  await expect(form(page).getByText('The people these accounts follow are added, not the accounts themselves. Up to 10.')).toBeVisible()

  await form(page).getByRole('button', { name: 'Remove seed3' }).click()
  await expect(seeds).toBeEnabled()
  await seeds.fill('another')
  await seeds.press('Enter')
  await expect(tags(page, 'Seed accounts')).toHaveCount(10)

  const queries = input(page, 'Search queries')
  await paste(queries, Array.from({ length: 11 }, (_, i) => `query ${i}`).join('\n'))
  await expect(tags(page, 'Search queries')).toHaveCount(10)
})

test('The text typed last in a tag box is not lost on Save', async ({ page, request }) => {
  const keywords = input(page, 'Keywords')
  await paste(keywords, Array.from({ length: 24 }, (_, i) => `keyword number ${i}`).join('\n'))

  await keywords.fill('left in the box')
  await form(page).getByRole('button', { name: 'Save campaign' }).click()
  await expect(form(page).getByRole('status')).toContainText('Saved')
  expect((await (await request.get(`/api/campaigns/${id}`)).json()).keywords).toContain('left in the box')
})
