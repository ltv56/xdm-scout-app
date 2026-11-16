import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

// Without a campaign the app shows the first-run screens, not the menu these tests use.
test.beforeEach(async ({ request }) => {
  await ensureCampaign(request)
})

test('Handles pasted into Known to the fund are listed, and can be taken off again', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Sending & people' }).click()
  const section = page.getByRole('region', { name: 'Known to the fund' })

  await section.getByRole('button', { name: 'Add to the list' }).click()
  await expect(section.getByRole('alert')).toHaveText('Give the list a name')

  await section.getByLabel('List name').fill('Portfolio')
  await section.getByLabel(/^Handles/).fill('handle\n@mina_builds\nnobody_known\nnot a handle\n')
  await section.getByRole('button', { name: 'Add to the list' }).click()
  await expect(section).toContainText('Added 1 person.')
  await expect(section).toContainText('Not found on X: @nobody_known')
  await expect(section).toContainText('Not a handle, skipped: not a handle')
  await expect(section.getByRole('listitem')).toContainText('@mina_builds · Portfolio')

  await section.getByRole('button', { name: 'Remove' }).click()
  await expect(section.getByRole('listitem')).toHaveCount(0)
})

test('A warm list keeps the event and marks the person as warm', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Sending & people' }).click()
  const section = page.getByRole('region', { name: 'Known to the fund' })

  await section.getByLabel('List name').fill('Build Week')
  await section.getByLabel(/^Handles/).fill('@mina_builds')
  await section.getByLabel(/They know us already/).check()
  await section.getByLabel('How they know us').fill('Met at Build Week')
  await section.getByRole('button', { name: 'Add to the list' }).click()
  await expect(section.getByRole('listitem')).toContainText('@mina_builds · Build Week (warm)')

  await section.getByRole('button', { name: 'Remove' }).click()
  await expect(section.getByRole('listitem')).toHaveCount(0)
})
