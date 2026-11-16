import type { Locator, Page } from '@playwright/test'

// The app draws its own dropdown list: open it, then click the option.
export async function pick(page: Page, box: Locator, option: string | RegExp) {
  await box.click()
  await page.getByRole('option', { name: option }).first().click()
}
