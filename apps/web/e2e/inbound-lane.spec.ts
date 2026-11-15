import { expect, test } from '@playwright/test'
import { createConnection } from 'mysql2/promise'
import emptyDatabase, { E2E_DATABASE_URL } from './global-setup.ts'

const NAME = `call lane ${Date.now()}`

// The fake X lives in the worker process, so the people who answered the call post are written to the database directly.
async function answerCallPost(campaignId: number, xUserId: string, handle: string, eventId: string) {
  const db = await createConnection(E2E_DATABASE_URL)
  try {
    await db.query("INSERT INTO x_users (xUserId, handle, name, bio, followers) VALUES (?, ?, ?, 'building agents', 10)", [xUserId, handle, handle])
    await db.query(
      "INSERT INTO prospects (campaignId, xUserId, relationship, source, callEventId, callText, callAt) VALUES (?, ?, 'messaged_us', 'call', ?, 'Build, I am working on an agent', NOW(3))",
      [campaignId, xUserId, eventId],
    )
    await db.query("INSERT INTO contacts (senderAccountId, xUserId, relationshipContext) SELECT id, ?, 'messaged_us' FROM sender_accounts LIMIT 1", [xUserId])
  } finally {
    await db.end()
  }
}

test.afterAll(async () => {
  await emptyDatabase()
})

test('Call lane: Check now reads the DMs, and Confirm invitation fills the permission without sending', async ({ page, request }) => {
  expect((await request.post('/api/auth/x/fake')).ok()).toBe(true)
  const created = await request.post('/api/campaigns', {
    data: { name: NAME, keywords: ['agents'], handles: ['mina_builds'], callPostUrl: 'https://x.com/genaifund/status/1856000000000000000', callKeyword: 'build' },
  })
  expect(created.ok()).toBe(true)
  const { id } = await created.json()
  await answerCallPost(id, '9101', 'call_mina', 'in-e2e-1')
  await answerCallPost(id, '9102', 'call_stopper', 'in-e2e-2')
  const db = await createConnection(E2E_DATABASE_URL)
  await db.query("INSERT INTO do_not_contact (xUserId, reason, source) VALUES ('9102', 'asked to stop', 'reply')")
  await db.end()

  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: NAME, exact: true }).click()
  await page.getByRole('button', { name: 'Check now' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'No new answers' })).toContainText('0 read, $0.00')

  await page.getByRole('navigation').getByRole('button', { name: 'Candidates' }).click()
  const mina = page.getByRole('listitem').filter({ hasText: '@call_mina' })
  await expect(mina.getByText('Their answer to your call post:')).toBeVisible()
  await mina.getByRole('button', { name: 'Confirm invitation' }).click()
  await expect(mina.getByText('Invitation confirmed')).toBeVisible()
  await expect(mina.getByRole('button', { name: 'Confirm invitation' })).toHaveCount(0)

  const stopper = page.getByRole('listitem').filter({ hasText: '@call_stopper' })
  await stopper.getByRole('button', { name: 'Confirm invitation' }).click()
  await expect(stopper.getByRole('alert')).toHaveText('This person is on Do not contact')
  await expect(stopper.getByText('Invitation confirmed')).toHaveCount(0)

  const check = await createConnection(E2E_DATABASE_URL)
  const [rows] = await check.query("SELECT xUserId, recipientPermission, invitationEventId FROM contacts WHERE xUserId IN ('9101', '9102') ORDER BY xUserId")
  const [sent] = await check.query("SELECT COUNT(*) AS n FROM send_attempts a JOIN contacts c ON c.id = a.contactId WHERE c.xUserId IN ('9101', '9102')")
  await check.end()
  expect(rows).toEqual([
    { xUserId: '9101', recipientPermission: 'requested_dm', invitationEventId: 'in-e2e-1' },
    { xUserId: '9102', recipientPermission: 'none', invitationEventId: null },
  ])
  expect(sent).toEqual([{ n: 0 }])
})
