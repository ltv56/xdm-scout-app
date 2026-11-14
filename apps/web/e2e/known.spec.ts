import { expect, test } from '@playwright/test'

test('Handles pasted into Known to the fund are listed, and can be taken off again', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
  const section = page.getByRole('region', { name: 'Known to the fund' })

  await section.getByRole('button', { name: 'Add to the list' }).click()
  await expect(section.getByRole('alert')).toHaveText('Give the list a name')

  await section.getByLabel('List name').fill('Portfolio')
  await section.getByLabel(/^Handles/).fill('handle\n@mina_builds\nnobody_known\nnot a handle\n')
  await section.getByRole('button', { name: 'Add to the list' }).click()
  await expect(section).toContainText('Added 1 person.')
  await expect(section).toContainText('not found on X: @nobody_known')
  await expect(section).toContainText('not a handle, skipped: not a handle')
  await expect(section.getByRole('listitem')).toContainText('@mina_builds · Portfolio')

  await section.getByRole('button', { name: 'Remove' }).click()
  await expect(section.getByRole('listitem')).toHaveCount(0)
})
