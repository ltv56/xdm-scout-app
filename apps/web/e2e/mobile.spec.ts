import { expect, test, type Page } from '@playwright/test'
import { draftCampaign } from './setup.ts'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

async function openApp(page: Page, campaign: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: campaign, exact: true }).click()
}

async function goTo(page: Page, section: string) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: new RegExp(`^${section}`) }).click()
}

// A real touch gesture through the browser, not a mouse drag.
async function swipe(page: Page, from: [number, number], to: [number, number]) {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => ({ touchPoints: [{ x, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', ...point(...from) })
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', ...point(from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('Phone: the sections sit behind one Menu button, and the menu names where you are', async ({ page, request }) => {
  const campaign = await draftCampaign(request)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Menu' }).click()
  const sections = page.getByRole('navigation', { name: 'Sections' })
  for (const name of ['Overview', 'Review', 'Messages', 'Candidates']) await expect(sections.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
  for (const name of ['Inbox', 'Outbox']) await expect(sections.getByRole('button', { name })).toHaveCount(0)
  for (const name of ['Profile', 'Settings', 'Activity']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: campaign, exact: true }).click()

  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0)
  await goTo(page, 'Candidates')
  await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible()
  await expect(page.locator('header').first().locator('span.truncate')).toHaveText('Candidates')

  await goTo(page, 'Messages')
  await expect(page.locator('header').first().locator('span.truncate')).toHaveText('Messages')
  await page.getByRole('tab', { name: 'Outbox' }).click()
  await expect(page.getByRole('tab', { name: 'Outbox' })).toHaveAttribute('aria-selected', 'true')
})

test('Phone: Approve is the one big button at the bottom of Review, not in the top bar', async ({ page, request }) => {
  const campaign = await draftCampaign(request)
  await openApp(page, campaign)
  await goTo(page, 'Review')

  const approve = page.getByRole('button', { name: 'Approve' })
  await expect(approve).toHaveCount(1)
  await expect(approve).toBeVisible()
  const box = (await approve.boundingBox())!
  expect(box.y + box.height).toBeGreaterThan(844 - 90)
  expect(box.width).toBeGreaterThan(150)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(approve).toBeVisible()
})

test('Phone: swipe left asks why to skip, up goes to the next draft, right goes back', async ({ page, request }) => {
  const campaign = await draftCampaign(request)
  await openApp(page, campaign)
  await goTo(page, 'Review')
  await expect(page.getByText(/1 of \d/)).toBeVisible()

  await swipe(page, [300, 400], [90, 400])
  await expect(page.getByText('Why skip this one?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Why skip this one?')).toHaveCount(0)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await swipe(page, [200, 600], [200, 300])
  await expect(page.getByText(/2 of \d/)).toBeVisible()

  await swipe(page, [90, 400], [300, 400])
  await expect(page.getByText(/1 of \d/)).toBeVisible()
})

test('Phone: a short drag while reading does not change the draft', async ({ page, request }) => {
  const campaign = await draftCampaign(request)
  await openApp(page, campaign)
  await goTo(page, 'Review')
  await swipe(page, [200, 500], [200, 440])
  await swipe(page, [200, 400], [150, 405])
  await expect(page.getByText(/1 of \d/)).toBeVisible()
  await expect(page.getByText('Why skip this one?')).toHaveCount(0)
})
