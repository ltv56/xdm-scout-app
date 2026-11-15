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
