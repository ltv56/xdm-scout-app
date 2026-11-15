import { expect, test } from '@playwright/test'

test('Activity log lists what was changed and offers a CSV', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()
  const known = page.getByRole('region', { name: 'Known to the fund' })
  await known.getByLabel('List name').fill('Activity test')
  await known.getByLabel(/^Handles/).fill('@mina_builds')
  await known.getByRole('button', { name: 'Add to the list' }).click()
  await expect(known).toContainText('Added 1 person.')
  await known.getByRole('button', { name: 'Remove' }).click()
  await expect(known.getByRole('listitem')).toHaveCount(0)

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Activity log' }).click()
  const log = page.getByRole('region', { name: 'Activity log' })
  await expect(log).toContainText('Added to Known to the fund · Activity test')
  await expect(log).toContainText('Removed mina_builds from Activity test')
  await expect(log.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', '/api/activity/csv')
})

test('The CSV has a header and the rows', async ({ request }) => {
  const res = await request.get('/api/activity/csv')
  expect(res.headers()['content-type']).toContain('text/csv')
  expect(await res.text()).toMatch(/^when,what,who,detail\r?\n/)
})
