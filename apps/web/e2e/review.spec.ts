import { expect, test, type Page } from '@playwright/test'
import { draftCampaign } from './setup.ts'

let campaign = ''

async function openPendingDraft(page: Page) {
  const approve = page.getByRole('button', { name: 'Approve', exact: true })
  const next = page.getByRole('button', { name: 'Next draft' })
  for (let i = 0; i < 10; i++) {
    if ((await approve.count()) > 0 && (await approve.isEnabled())) return true
    if (await next.isDisabled()) break
    await next.click()
  }
  return false
}

test.beforeAll(async ({ request }) => {
  campaign = await draftCampaign(request)
})

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: campaign, exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: /^Review/ }).click()
  await expect(page.getByRole('region', { name: 'Draft message' })).toBeVisible()
  expect(await openPendingDraft(page)).toBe(true)
})

test('Review: reading a draft, the source of a sentence, approving it, and Open chat on X also copying it', async ({ page, context }) => {
  const heading = page.getByRole('heading', { level: 2 })
  await expect(page.getByText('Open chat with @')).toBeDisabled()

  await page.getByRole('region', { name: 'Draft message' }).getByRole('button').nth(1).focus()
  await expect(page.getByRole('region', { name: 'Evidence' })).toBeVisible()

  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const link = page.getByRole('link', { name: /^Open chat with @/ })
  await expect(link).toHaveAttribute('href', /x\.com\/messages\/compose/)
  await expect(heading).toBeVisible()

  // Opening X also puts the draft on the clipboard, to paste if X does not fill it in.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.route('https://x.com/**', (route) => route.abort())
  const readClipboard = () => page.evaluate(() => navigator.clipboard.readText())
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  const draft = await readClipboard()
  expect(draft.length).toBeGreaterThan(20)
  await page.evaluate(() => navigator.clipboard.writeText('something else'))
  const [popup] = await Promise.all([context.waitForEvent('page'), link.click()])
  await popup.close()
  await expect.poll(readClipboard).toBe(draft)
  await expect(page.getByRole('status').filter({ hasText: 'Draft copied' })).toBeVisible()
  // Opening the chat counts as sent by hand; Not sent is there to take it back.
  await expect(page.getByText('Sent by hand.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Not sent' })).toBeVisible()
})

test('Review: Skip asks for a reason and moves on', async ({ page }) => {
  const heading = page.getByRole('heading', { level: 2 })
  const before = await heading.textContent()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('radio', { name: 'Weak opening' }).check()
  await page.getByRole('button', { name: 'Skip draft' }).click()
  await expect(heading).not.toHaveText(before ?? '')
})

test('Review: Do not contact asks first, and Cancel keeps the draft', async ({ page }) => {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /^Do not contact @/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /^Never contact @/ })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('region', { name: 'Draft message' })).toBeVisible()
})
