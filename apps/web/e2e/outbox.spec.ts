import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

const item = (attemptId: number, handle: string, label: string, error: string | null = null) => ({ attemptId, handle, name: null, preview: 'Hi there', reply: null, label, route: 'api', error, at: '2026-11-15T10:00:00Z', draftId: attemptId + 100, openInX: null, text: null })

test('Outbox lists the sends with their state and refreshes faster while one is on its way', async ({ page, request }) => {
  await ensureCampaign(request)
  let calls = 0
  await page.route('**/api/outbox*', (r) => {
    calls += 1
    return r.fulfill({ json: { inFlight: true, items: [item(2, 'mina_builds', 'Sending'), item(1, 'old_friend', 'Failed', 'X said no')] } })
  })
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 3, dailyCap: 25, workerRunning: true, campaignCostMicros: null, llmUnpriced: false } }))
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()
  await expect(page.getByRole('region', { name: 'Outbox' })).toContainText('Sent today 3 of 25')
  await expect(page.getByText('@mina_builds')).toBeVisible()
  await expect(page.getByText('Sending')).toBeVisible()
  await expect(page.getByText('X said no')).toBeVisible()
  await expect.poll(() => calls, { timeout: 12_000 }).toBeGreaterThan(1)
})

test('Outbox: a hand-off row opens X and copies the draft, other rows have no such link', async ({ page, context, request }) => {
  await ensureCampaign(request)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.route('https://x.com/**', (route) => route.abort())
  const link = 'https://x.com/messages/compose?recipient_id=201&text=Hi%20Tomas'
  await page.route('**/api/outbox*', (r) =>
    r.fulfill({ json: { inFlight: false, items: [{ ...item(3, 'tomas_agents', 'Send in X'), route: 'manual', openInX: link, text: 'Hi Tomas, saw your post.' }, item(1, 'old_friend', 'Sent')] } }),
  )
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 0, dailyCap: 25, workerRunning: true, campaignCostMicros: null, llmUnpriced: false } }))
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()
  const open = page.getByRole('link', { name: 'Open chat on X' })
  await expect(open).toHaveCount(1)
  await expect(open).toHaveAttribute('href', link)
  await page.evaluate(() => navigator.clipboard.writeText('something else'))
  const [popup] = await Promise.all([context.waitForEvent('page'), open.click()])
  await popup.close()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Hi Tomas, saw your post.')
  await expect(page.getByRole('status').filter({ hasText: 'Draft copied' })).toBeVisible()
})

test('Outbox: a row shows the name, the message and the reply', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/outbox*', (r) =>
    r.fulfill({ json: { inFlight: false, items: [{ ...item(2, 'mina_builds', 'Sent'), name: 'Mina Park', preview: 'Your robot policy checkpoints stood out to me.', reply: 'Interested' }, item(1, 'tomas_agents', 'Sent')] } }),
  )
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()
  const mina = page.getByRole('listitem').filter({ hasText: 'Mina Park' })
  await expect(mina).toContainText('@mina_builds')
  await expect(mina).toContainText('Your robot policy checkpoints stood out to me.')
  await expect(mina).toContainText('Replied · Interested')
  await expect(page.getByRole('listitem').filter({ hasText: '@tomas_agents' })).toContainText('No reply yet')
})

test('Outbox: opening X asks whether it was sent; Yes counts it, Not sent takes it back', async ({ page, context, request }) => {
  await ensureCampaign(request)
  await context.route('https://x.com/**', (route) => route.abort())
  let state: 'pending' | 'opened' | 'sent' | 'undone' = 'pending'
  const bodies: unknown[] = []
  await page.route('**/api/drafts/103/opened', (r) => {
    state = 'opened'
    return r.fulfill({ json: { watching: true } })
  })
  await page.route('**/api/drafts/103/manual', (r) => {
    const body = r.request().postDataJSON() as { outcome: string }
    bodies.push(body)
    state = body.outcome === 'sent' ? 'sent' : 'undone'
    return r.fulfill({ json: {} })
  })
  await page.route('**/api/outbox*', (r) => {
    const rows = {
      pending: [{ ...item(3, 'tomas_agents', 'Send in X'), route: 'manual', openInX: 'https://x.com/messages/compose?recipient_id=201&text=Hi', text: 'Hi' }],
      opened: [{ ...item(3, 'tomas_agents', 'Did you send it?'), route: 'manual', openInX: 'https://x.com/messages/compose?recipient_id=201&text=Hi', text: 'Hi' }],
      sent: [{ ...item(3, 'tomas_agents', 'Sent by hand'), route: 'manual', openInX: 'https://x.com/messages/compose?recipient_id=201' }],
      undone: [{ ...item(3, 'tomas_agents', 'Cancelled'), route: 'manual' }],
    }[state]
    return r.fulfill({ json: { inFlight: false, items: rows } })
  })
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 0, dailyCap: 25, workerRunning: true, campaignCostMicros: null, llmUnpriced: false } }))
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()

  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Open chat on X' }).click()])
  await popup.close()
  // Opening is not sending: the row asks.
  await expect(page.getByText('Did you send it?', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open chat on X' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sent?', exact: true }).click()
  await page.getByRole('button', { name: 'It was sent' }).click()
  await expect(page.getByText('Sent by hand', { exact: true })).toBeVisible()
  // Opening again must not fill the draft in a second time.
  await expect(page.getByRole('link', { name: /^Open the chat with @/ })).toHaveAttribute('href', 'https://x.com/messages/compose?recipient_id=201')

  // Not sent asks first; Cancel leaves the send as it is.
  await page.getByRole('button', { name: 'Not sent' }).click()
  await page.getByRole('group', { name: "Didn't send it?" }).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Sent by hand').first()).toBeVisible()
  await page.getByRole('button', { name: 'Not sent' }).click()
  await page.getByRole('button', { name: 'Yes, take it back' }).click()
  await expect(page.getByText('Cancelled')).toBeVisible()
  expect(bodies).toEqual([{ outcome: 'sent' }, { outcome: 'not_sent' }])
})
