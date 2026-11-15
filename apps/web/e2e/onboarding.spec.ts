import { expect, test, type Page } from '@playwright/test'

// The first run, with the API answers faked, so it does not depend on what the database holds.
const EMPTY_PROFILE = { intro: '', programs: [], signer: '', sampleMessages: [] }
const PROFILE = {
  intro: 'We back AI builders in Southeast Asia.',
  programs: [{ id: 1, name: 'FastTrack AI Accelerator', description: 'GPU credits and experts.', link: 'https://genaifund.ai/', deadline: null }],
  signer: 'Linh',
  sampleMessages: [],
  frame: { greeting: null, optOut: null, contactLine: null },
}
const sandbox = (connected: boolean) => ({ mode: 'fake', connected, handle: connected ? 'sandbox_sender' : null, tokenExpiresAt: null, missingScopes: [] })

async function firstRun(page: Page) {
  let connected = false
  let profile: object = EMPTY_PROFILE
  let campaigns: { id: number; name: string }[] = []
  await page.route('**/api/auth/x/status', (r) => r.fulfill({ json: sandbox(connected) }))
  await page.route('**/api/auth/x/fake', (r) => {
    connected = true
    return r.fulfill({ json: sandbox(true) })
  })
  await page.route('**/api/sender-profile', (r) => {
    if (r.request().method() === 'PUT') {
      profile = r.request().postDataJSON()
      return r.fulfill({ json: profile })
    }
    return r.fulfill({ json: profile })
  })
  await page.route('**/api/campaigns', (r) => {
    if (r.request().method() === 'POST') {
      campaigns = [{ id: 5, name: r.request().postDataJSON().name }]
      return r.fulfill({ json: { id: 5 } })
    }
    return r.fulfill({ json: campaigns })
  })
}

const noShell = async (page: Page) => {
  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toHaveCount(0)
}

test('First run: only the connect screen shows, with no menu', async ({ page }) => {
  await firstRun(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Connect the account that sends' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use sandbox account' })).toBeVisible()
  await expect(page.getByText('Nothing is sent')).toBeVisible()
  await noShell(page)
})

test('First run: connecting moves on to the fund profile, saving it moves on to the first campaign', async ({ page }) => {
  await firstRun(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Use sandbox account' }).click()

  await expect(page.getByRole('heading', { name: 'Tell us about the fund' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Fund profile' })).toHaveAttribute('aria-current', 'step')
  await noShell(page)
  await page.getByRole('textbox', { name: 'Who you are' }).fill(PROFILE.intro)
  await page.getByRole('button', { name: 'Add a program' }).click()
  await page.getByRole('textbox', { name: 'Name' }).first().fill(PROFILE.programs[0].name)
  await page.getByRole('textbox', { name: 'One sentence about it' }).fill(PROFILE.programs[0].description)
  await page.getByRole('textbox', { name: 'Link' }).fill(PROFILE.programs[0].link)
  await page.getByRole('textbox', { name: 'Who signs the message' }).fill(PROFILE.signer)
  await page.getByRole('button', { name: 'Save profile' }).click()

  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()
  await expect(page.getByText('Say who to look for, then press Run first search on the Overview.')).toBeVisible()
  await noShell(page)
})

test('First run: creating the first campaign opens the full app', async ({ page }) => {
  await firstRun(page)
  await page.route('**/api/auth/x/status', (r) => r.fulfill({ json: sandbox(true) }))
  await page.route('**/api/sender-profile', (r) => r.fulfill({ json: PROFILE }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Name' }).fill('SEA agent builders')
  await page.getByRole('textbox', { name: 'Keywords' }).fill('robotics\nllm')
  await page.getByRole('textbox', { name: 'Handles' }).fill('mina_builds')
  await page.getByRole('button', { name: 'Create campaign' }).click()

  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
})
