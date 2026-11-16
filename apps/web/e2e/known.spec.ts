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

test('The AI read of a file shows the cost first, then a numbered panel to check before the handles are used', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: /^Sending/ }).click()
  const section = page.getByRole('region', { name: 'Known to the fund' })

  await section.getByRole('checkbox', { name: /Let AI find the handles/ }).check()
  await section.getByLabel('Load a CSV file').setInputFiles({
    name: 'leads.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Contact\nMina,@mina_builds\nTomas,https://x.com/tomas_agents\nLena,lena@example.com\n'),
  })
  // The file stays out of the box until the panel is confirmed; the sandbox has no model, so the read is free.
  await expect(section.getByLabel(/^Handles/)).toHaveValue('')
  await expect(section).toContainText('No model key here')
  await section.getByRole('button', { name: 'Find handles' }).click()

  const panel = page.getByRole('dialog', { name: 'Found 2 handles in leads.csv' })
  await expect(panel.getByRole('list', { name: 'Handles found' }).getByRole('listitem')).toHaveText([/1\.\s*@mina_builds\s*Line 2/, /2\.\s*@tomas_agents\s*Line 3/])
  await expect(panel.getByText('No handle found on 2 lines')).toBeVisible()
  await expect(panel.getByRole('status')).toContainText('at no cost')

  await panel.getByRole('checkbox').nth(1).uncheck()
  await panel.getByRole('button', { name: 'Use this one' }).click()
  await expect(panel).toHaveCount(0)
  await expect(section.getByLabel(/^Handles/)).toHaveValue('mina_builds')

  // Escape closes the panel without changing the box.
  await section.getByRole('button', { name: 'Find handles' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(section.getByLabel(/^Handles/)).toHaveValue('mina_builds')
})
