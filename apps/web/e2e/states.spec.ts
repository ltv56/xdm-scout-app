import { expect, test, type Locator, type Page } from '@playwright/test'
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

// The block of title, sentence and button sits in the middle of the card, both ways.
async function expectCentred(page: Page, empty: Locator, area: Locator = page.locator('#main > div')) {
  const card = (await area.boundingBox())!
  const block = await empty.evaluate((el) => {
    const boxes = [...el.children].map((c) => c.getBoundingClientRect())
    return { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)), top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)) }
  })
  expect(Math.abs((block.left + block.right) / 2 - (card.x + card.width / 2))).toBeLessThan(4)
  expect(Math.abs((block.top + block.bottom) / 2 - (card.y + card.height / 2))).toBeLessThan(40)
}

async function openCampaign(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
}

test('With nothing to show, Review and Candidates are centred and point to the next move', async ({ page, request }) => {
  const id = await ensureCampaign(request)
  await page.route('**/api/review-queue*', (r) => r.fulfill({ json: { campaignId: id, sessionSize: 10, items: [] } }))
  await page.route('**/api/campaigns/*/prospects', (r) => r.fulfill({ json: [] }))
  await openCampaign(page)
  const nav = page.getByRole('navigation')

  await nav.getByRole('button', { name: /^Review/ }).click()
  const review = page.getByRole('region', { name: 'Nothing to review' })
  await expect(page.getByRole('heading', { name: 'Nothing to review' })).toBeVisible()
  await expectCentred(page, review)
  await review.getByRole('button', { name: 'Go to Overview' }).click()
  await expect(nav.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')

  await nav.getByRole('button', { name: 'Candidates' }).click()
  const candidates = page.getByRole('region', { name: 'No candidates yet' })
  await expect(candidates.getByText('Run a search from the Overview.')).toBeVisible()
  await expectCentred(page, candidates)
  await candidates.getByRole('button', { name: 'Go to Overview' }).click()
  await expect(nav.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
})

test('With nothing sent, Inbox, Outbox and Activity share the same centred empty state', async ({ page, request }) => {
  const id = await ensureCampaign(request)
  await page.route('**/api/inbox/checks*', (r) => r.fulfill({ json: { campaignId: id, replies: [], toCheck: [], delivered: [] } }))
  await page.route('**/api/outbox*', (r) => r.fulfill({ json: { inFlight: false, items: [] } }))
  await page.route('**/api/activity', (r) => r.fulfill({ json: [] }))
  await openCampaign(page)
  const nav = page.getByRole('navigation', { name: 'Sections' })

  await nav.getByRole('button', { name: 'Messages' }).click()
  const inbox = page.getByRole('region', { name: 'No replies yet' })
  await expectCentred(page, inbox, page.getByRole('tabpanel'))
  await inbox.getByRole('button', { name: 'Go to Review' }).click()
  await expect(nav.getByRole('button', { name: /^Review/ })).toHaveAttribute('aria-current', 'page')

  await nav.getByRole('button', { name: 'Messages' }).click()
  await page.getByRole('tab', { name: 'Outbox' }).click()
  const outbox = page.getByRole('region', { name: 'Nothing sent yet' })
  await expect(outbox.getByText('Every send appears here with its state.')).toBeVisible()
  await expectCentred(page, outbox, page.getByRole('tabpanel'))
  await outbox.getByRole('button', { name: 'Go to Review' }).click()
  await expect(nav.getByRole('button', { name: /^Review/ })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('list', { name: 'Account menu' }).getByRole('button', { name: 'Activity log' }).click()
  const activity = page.getByRole('region', { name: 'No activity yet' })
  await expect(activity.getByText('Changes to who may be contacted are logged here')).toBeVisible()
  await expectCentred(page, activity)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test('the empty state is centred and its button works', async ({ page, request }) => {
    const id = await ensureCampaign(request)
    await page.route('**/api/review-queue*', (r) => r.fulfill({ json: { campaignId: id, sessionSize: 10, items: [] } }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: /^Review/ }).click()
    const review = page.getByRole('region', { name: 'Nothing to review' })
    await expectCentred(page, review)
    await review.getByRole('button', { name: 'Go to Overview' }).click()
    await expect(review).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
