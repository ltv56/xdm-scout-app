import { expect, test } from '@playwright/test'
import { createConnection } from 'mysql2/promise'
import { E2E_DATABASE_URL } from './global-setup.ts'

async function withDb<T>(run: (db: Awaited<ReturnType<typeof createConnection>>) => Promise<T>) {
  const db = await createConnection(E2E_DATABASE_URL)
  try {
    return await run(db)
  } finally {
    await db.end()
  }
}

test('Removing someone from Do not contact needs a reason, and the reason is logged', async ({ page }) => {
  await withDb((db) => db.query("INSERT INTO do_not_contact (xUserId, reason, source) VALUES ('777000111', 'Reply marked Opt-out', 'operator')"))
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Settings' }).click()

  const section = page.getByRole('region', { name: 'Do not contact' })
  await expect(section).toContainText('@777000111')
  await expect(section).toContainText('Reply marked Opt-out')

  await section.getByRole('button', { name: 'Remove' }).click()
  await section.getByRole('button', { name: 'Remove from the list' }).click()
  await expect(section.getByRole('alert')).toHaveText('Say why this person can be contacted again')
  await expect(section).toContainText('@777000111')

  await section.getByLabel('Why can @777000111 be contacted again?').fill('They wrote back and asked for the call')
  await section.getByRole('button', { name: 'Remove from the list' }).click()
  await expect(section).not.toContainText('@777000111')

  const [rows] = await withDb((db) => db.query("SELECT kind, subject, detail FROM activity_log WHERE subject = '777000111'"))
  expect(rows).toEqual([{ kind: 'dnc_removed', subject: '777000111', detail: 'They wrote back and asked for the call' }])
})
