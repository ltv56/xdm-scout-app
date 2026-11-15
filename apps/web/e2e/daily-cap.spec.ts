import { expect, test } from '@playwright/test'

async function openMenu(page: import('@playwright/test').Page, item: string) {
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: item }).click()
}

test('Settings: the daily send cap can be changed, is checked, and the change is logged', async ({ page, request }) => {
  await page.goto('/')
  await openMenu(page, 'Settings')
  const cap = page.getByRole('region', { name: 'Daily send cap' })
  await expect(cap.getByLabel(/^Messages per day/)).toHaveValue('25')

  await cap.getByLabel(/^Messages per day/).fill('501')
  await expect(cap.getByRole('button', { name: 'Save' })).toBeDisabled()
  expect((await request.put('/api/send-settings', { data: { dailyCap: 501 } })).status()).toBe(400)

  await cap.getByLabel(/^Messages per day/).fill('40')
  await cap.getByRole('button', { name: 'Save' }).click()
  await expect(cap.getByRole('status')).toHaveText('Saved.')
  expect(await (await request.get('/api/send-settings')).json()).toMatchObject({ dailyCap: 40 })

  await openMenu(page, 'Activity log')
  await expect(page.getByRole('region', { name: 'Activity log' })).toContainText('Daily send cap changed from 25 to 40')
})
