import { expect, test, type Page } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('When the server fails, Overview, Review and Candidates say so instead of looking empty', async ({ page, request }) => {
  await ensureCampaign(request)
  const fail = (r: { fulfill: (o: object) => Promise<void> }) => r.fulfill({ status: 500, json: { message: 'The server is down' } })
  await page.route('**/api/review-queue*', fail)
  await page.route('**/api/campaigns/*/prospects', fail)
  await page.route('**/api/campaigns/*/drafts/ready', fail)
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  const nav = page.getByRole('navigation')

  await expect(page.getByRole('alert')).toContainText('Some numbers could not be loaded: The server is down')
  await nav.getByRole('button', { name: /^Review/ }).click()
  await expect(page.getByRole('alert')).toHaveText('The server is down')
  await nav.getByRole('button', { name: 'Candidates' }).click()
  await expect(page.getByRole('alert')).toHaveText('The server is down')
})

async function openCampaign(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
}

test('With nothing to show, Review and Candidates point to the next move', async ({ page, request }) => {
  const id = await ensureCampaign(request)
  await page.route('**/api/review-queue*', (r) => r.fulfill({ json: { campaignId: id, sessionSize: 10, items: [] } }))
  await page.route('**/api/campaigns/*/prospects', (r) => r.fulfill({ json: [] }))
  await openCampaign(page)
  const nav = page.getByRole('navigation')

  await nav.getByRole('button', { name: /^Review/ }).click()
  const review = page.getByRole('region', { name: 'Nothing to review' })
  await expect(page.getByRole('heading', { name: 'Nothing to review' })).toBeVisible()
  await review.getByRole('button', { name: 'Go to Overview' }).click()
  await expect(nav.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')

  await nav.getByRole('button', { name: 'Candidates' }).click()
  const candidates = page.getByRole('region', { name: 'No candidates yet' })
  await expect(candidates.getByText('Run a search from the Overview.')).toBeVisible()
  await candidates.getByRole('button', { name: 'Go to Overview' }).click()
  await expect(nav.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
})

test('With nothing sent, Inbox, Outbox and Activity share the same empty state', async ({ page, request }) => {
  const id = await ensureCampaign(request)
  await page.route('**/api/inbox/checks*', (r) => r.fulfill({ json: { campaignId: id, replies: [], toCheck: [], delivered: [] } }))
  await page.route('**/api/outbox*', (r) => r.fulfill({ json: { inFlight: false, items: [] } }))
  await page.route('**/api/activity', (r) => r.fulfill({ json: [] }))
  await openCampaign(page)
  const nav = page.getByRole('navigation', { name: 'Sections' })

  await nav.getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Inbox' }).click()
  const inbox = page.getByRole('region', { name: 'No replies yet' })
  await inbox.getByRole('button', { name: 'Go to Review' }).click()
  await expect(nav.getByRole('button', { name: /^Review/ })).toHaveAttribute('aria-current', 'page')

  await nav.getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()
  const outbox = page.getByRole('region', { name: 'Nothing sent yet' })
  await expect(outbox.getByText('Every send appears here with its state.')).toBeVisible()
  await outbox.getByRole('button', { name: 'Go to Review' }).click()
  await expect(nav.getByRole('button', { name: /^Review/ })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Activity log' }).click()
  const activity = page.getByRole('region', { name: 'No activity yet' })
  await expect(activity.getByText('Changes to who may be contacted are logged here')).toBeVisible()
})

