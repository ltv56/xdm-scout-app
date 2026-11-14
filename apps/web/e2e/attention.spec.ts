import { expect, test, type Page } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const ITEMS = [
  { id: 'x_disconnected', kind: 'x_disconnected', priority: 1, title: 'X account', reason: 'X connection expired. Reconnect to continue.', since: null, goTo: 'profile' },
  { id: 'reply-1', kind: 'reply', priority: 1, title: 'mina_builds', reason: 'Interested: Yes, tell me more', since: ago(30), goTo: 'inbox' },
  { id: 'worker_stopped', kind: 'worker_stopped', priority: 1, title: 'Worker', reason: 'The background worker is not running: nothing is being sent or read.', since: null, goTo: null },
]

async function openOverview(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
}

test('Overview starts with what needs a person, and Open goes to the page that fixes it', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/needs-attention*', (r) => r.fulfill({ json: ITEMS }))
  await openOverview(page)

  const section = page.getByRole('region', { name: 'Needs attention' })
  await expect(section).toContainText('3')
  await expect(section).toContainText('mina_builds')
  await expect(section).toContainText('waiting 30 h')
  await expect(section).toContainText('Interested: Yes, tell me more')
  await expect(section.getByRole('button')).toHaveCount(2)

  await section.getByRole('button', { name: 'Open Inbox' }).click()
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page')
})

test('With nothing waiting the section is not shown', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/needs-attention*', (r) => r.fulfill({ json: [] }))
  await openOverview(page)
  await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Needs attention' })).toHaveCount(0)
})
