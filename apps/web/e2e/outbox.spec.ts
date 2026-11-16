import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

const item = (attemptId: number, handle: string, label: string, error: string | null = null) => ({ attemptId, handle, label, route: 'api', error, at: '2026-11-15T10:00:00Z', draftId: attemptId + 100, openInX: null, text: null })

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

test('Outbox: after X is opened the row asks Sent?, also after a reload, and records the answer', async ({ page, context, request }) => {
  await ensureCampaign(request)
  await context.route('https://x.com/**', (route) => route.abort())
  let sent = false
  let body: unknown = null
  await page.route('**/api/drafts/103/manual', (r) => {
    sent = true
    body = r.request().postDataJSON()
    return r.fulfill({ json: {} })
  })
  await page.route('**/api/outbox*', (r) => {
    const row = sent
      ? { ...item(3, 'tomas_agents', 'Check in X'), route: 'manual' }
      : { ...item(3, 'tomas_agents', 'Send in X'), route: 'manual', openInX: 'https://x.com/messages/compose?recipient_id=201&text=Hi', text: 'Hi' }
    return r.fulfill({ json: { inFlight: false, items: [row] } })
  })
  await page.route('**/api/top-bar*', (r) => r.fulfill({ json: { mode: 'fake', sentToday: 0, dailyCap: 25, workerRunning: true, campaignCostMicros: null, llmUnpriced: false } }))
  const openOutbox = async () => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Messages' }).click()
    await page.getByRole('tab', { name: 'Outbox' }).click()
  }
  await openOutbox()
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Open chat on X' }).click()])
  await popup.close()
  await expect(page.getByRole('link', { name: 'Open chat on X' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'open again' })).toBeVisible()

  await openOutbox()
  await page.getByRole('button', { name: 'Sent?', exact: true }).click()
  await page.getByRole('button', { name: 'It was sent' }).click()
  await expect(page.getByText('Check in X')).toBeVisible()
  expect(body).toEqual({ outcome: 'sent' })
  await expect(page.getByText('Looking for your message in the chat')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sent?', exact: true })).toHaveCount(0)
})
