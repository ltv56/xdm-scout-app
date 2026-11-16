import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test.beforeEach(async ({ page, request }) => {
  await ensureCampaign(request)
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
})

const tabs = ['Campaign', 'Sending & people', 'Cost', 'Setup check']
const sections: Record<string, string[]> = {
  Campaign: ['Campaign'],
  'Sending & people': ['Daily send cap', 'Known to the fund', 'Do not contact'],
  Cost: ['Cost'],
  'Setup check': ['Setup check'],
}

test('Settings is split into four tabs and opens on Campaign', async ({ page }) => {
  await expect(page.getByRole('tablist', { name: 'Settings' }).getByRole('tab')).toHaveText(tabs)
  await expect(page.getByRole('tab', { name: 'Campaign' })).toHaveAttribute('aria-selected', 'true')
})

test('Each tab shows only its own sections', async ({ page }) => {
  for (const tab of tabs) {
    await page.getByRole('tab', { name: tab }).click()
    for (const [other, names] of Object.entries(sections)) {
      for (const name of names) await expect(page.getByRole('region', { name, exact: true })).toHaveCount(other === tab ? 1 : 0)
    }
  }
})

test('The arrow keys move between the tabs', async ({ page }) => {
  await page.getByRole('tab', { name: 'Campaign' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Sending & people' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Campaign' })).toHaveAttribute('aria-selected', 'true')
})
