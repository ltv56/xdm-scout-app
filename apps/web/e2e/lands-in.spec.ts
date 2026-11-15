import { expect, test } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

test('Candidates says where each message will probably land', async ({ page, request }) => {
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

  await expect(page.getByText('Likely lands in: Inbox')).toBeVisible()
  await expect(page.getByText('Likely lands in: Message requests')).toBeVisible()
  await expect(page.getByText("Likely lands in: Can't receive")).toBeVisible()
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

  const people = page.getByRole('listitem').filter({ hasText: 'Likely lands in' })
  const filter = page.getByLabel(/^Likely lands in/)
  await expect(filter).toHaveValue('any')
  await filter.selectOption('requests')
  await expect(page.getByRole('status').filter({ hasText: 'candidate' })).toHaveText('1 candidate shown')
  await expect(page.getByText('Likely lands in: Message requests')).toBeVisible()
  await expect(page.getByText('Likely lands in: Inbox')).toHaveCount(0)

  await filter.selectOption('cant_receive')
  await expect(page.getByRole('status').filter({ hasText: 'candidate' })).toHaveText('1 candidate shown')
  await expect(people).toHaveCount(1)

  await filter.selectOption('unknown')
  await expect(page.getByText(/Likely lands in:/)).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'candidate' })).not.toHaveText('0 candidates shown')
})
