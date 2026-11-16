import { expect, test } from '@playwright/test'
import { draftCampaign } from './setup.ts'

test('On a desktop screen the draft column and the evidence column each scroll on their own', async ({ page, request }) => {
  const name = await draftCampaign(request)
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: /^Review/ }).click()

  const evidence = page.locator('aside.scroll-thin')
  const draft = evidence.locator('xpath=preceding-sibling::div[1]')
  for (const column of [draft, evidence]) {
    await expect(column).toBeVisible()
    // Held to the height of the panel, so what does not fit can be scrolled to.
    expect(await column.evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight < innerHeight)).toBe(true)
    expect(await column.evaluate((el) => { el.scrollTop = 120; return el.scrollTop })).toBeGreaterThan(0)
  }
})
