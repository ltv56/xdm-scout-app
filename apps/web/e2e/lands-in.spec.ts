import { expect, test } from '@playwright/test'
import { pick } from './pick.ts'
import { draftCampaign, ensureCampaign } from './setup.ts'

test('Candidates warns only about closed DMs; Inbox and Message requests are left for the moment of sending', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/campaigns/*/prospects', async (route) => {
    const rows = await (await route.fetch()).json()
    const values = ['inbox', 'requests', 'cant_receive']
    await route.fulfill({ json: rows.map((r: object, i: number) => ({ ...r, landsIn: values[i] ?? null })) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Candidates' }).click()

  const notes = page.getByRole('note')
  await expect(notes).toHaveCount(1)
  await expect(notes).toHaveText("X says their DMs are closed, so a message can't reach them.")
  await expect(page.getByText(/Message requests/)).toHaveCount(0)
  await expect(page.getByText(/Likely lands in:/)).toHaveCount(0)
})

test('Candidates can be filtered by where the message will probably land', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.route('**/api/campaigns/*/prospects', async (route) => {
    const rows = await (await route.fetch()).json()
    const values = ['requests', 'cant_receive']
    await route.fulfill({ json: rows.map((r: object, i: number) => ({ ...r, landsIn: values[i] ?? null })) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: 'robotics demo', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Candidates' }).click()

  const notes = page.getByRole('note')
  const filter = page.getByLabel(/^Likely lands in/)
  await expect(filter).toContainText('All')
  await pick(page, filter, 'Message requests')
  await expect(page.getByRole('status').filter({ hasText: 'candidate' })).toHaveText('1 candidate shown')
  await expect(notes).toHaveCount(0)

  await pick(page, filter, "Can't receive")
  await expect(page.getByRole('status').filter({ hasText: 'candidate' })).toHaveText('1 candidate shown')
  await expect(notes).toHaveCount(1)
  await expect(notes).toContainText('DMs are closed')

  await pick(page, filter, 'Unknown')
  await expect(notes).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'candidate' })).not.toHaveText('0 candidates shown')
})

test('Review says where the message will probably land, next to where it is sent', async ({ page, request }) => {
  const name = await draftCampaign(request)
  await page.route('**/api/review-queue*', async (route) => {
    const body = await (await route.fetch()).json()
    await route.fulfill({ json: { ...body, items: body.items.map((i: { prospect: object }) => ({ ...i, prospect: { ...i.prospect, landsIn: 'requests' } })) } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: /^Review/ }).click()
  const note = page.getByRole('note').filter({ hasText: 'Message requests' })
  await expect(note).toHaveText("Probably lands in Message requests: they don't follow you and haven't messaged you first.")
  await expect(page.getByText(/^Send it/).first()).toBeVisible()
})
