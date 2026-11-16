import { expect, test, type Page } from '@playwright/test'

// The first run, with the API answers faked, so it does not depend on what the database holds.
const EMPTY_PROFILE = { intro: '', programs: [], signer: '', sampleMessages: [] }
const ANSWERS = {
  intro: 'We back AI builders in Southeast Asia.',
  program: { name: 'FastTrack AI Accelerator', description: 'GPU credits and experts.', link: 'https://genaifund.ai/' },
  signer: 'Linh',
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
    if (r.request().method() === 'PUT') profile = r.request().postDataJSON()
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

async function fillProfile(page: Page) {
  await page.getByRole('textbox', { name: 'Who you are' }).fill(ANSWERS.intro)
  await page.getByRole('textbox', { name: 'What you offer' }).fill(ANSWERS.program.name)
  await page.getByRole('textbox', { name: 'One sentence about it' }).fill(ANSWERS.program.description)
  await page.getByRole('textbox', { name: 'Link' }).fill(ANSWERS.program.link)
  await page.getByRole('textbox', { name: 'Who signs the message' }).fill(ANSWERS.signer)
  await page.getByRole('textbox', { name: 'Contact line' }).fill('Write to me at linh@example.com')
}

test('First run: only the connect screen shows, with no menu', async ({ page }) => {
  await firstRun(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Connect the account that sends' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use sandbox account' })).toBeVisible()
  await expect(page.getByText('Nothing is sent')).toBeVisible()
  await expect(page.getByText('Step 1 of 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  await noShell(page)
})

test('First run: the fund profile asks for five required answers and one optional one', async ({ page }) => {
  await firstRun(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Use sandbox account' }).click()

  await expect(page.getByRole('heading', { name: 'Tell us about the fund' })).toBeVisible()
  await expect(page.getByText('Step 2 of 3')).toBeVisible()
  await noShell(page)
  // Six boxes: five required ones with a red star, and one optional contact line.
  expect(await page.getByRole('textbox').count()).toBe(6)
  await expect(page.getByText('(optional)')).toHaveCount(1)
  // Each of the five is required, and says so with a red star.
  expect(await page.locator('label span[aria-hidden]', { hasText: '*' }).count()).toBe(5)
  for (const extra of ['Add a program', 'Greeting', 'Messages in your own voice']) await expect(page.getByText(extra)).toHaveCount(0)
})

test('First run: a missing answer is named, then saving moves on to the first campaign', async ({ page }) => {
  await firstRun(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Use sandbox account' }).click()

  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('alert')).toHaveText('Say who you are.')
  await fillProfile(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()
  await expect(page.getByText('Step 3 of 3')).toBeVisible()
  await expect(page.getByText('Say who to look for, then press Run first search on the Overview.')).toBeVisible()
  await noShell(page)
})

test('First run: Back returns to an earlier step, keeps what was saved and Continue goes on again', async ({ page }) => {
  await firstRun(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Use sandbox account' }).click()
  await fillProfile(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Tell us about the fund' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Who you are' })).toHaveValue(ANSWERS.intro)
  await expect(page.getByRole('textbox', { name: 'Contact line' })).toHaveValue('Write to me at linh@example.com')

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Connect the account that sends' })).toBeVisible()
  await expect(page.getByText('Connected as @sandbox_sender')).toBeVisible()
  await expect(page.getByText('Step 1 of 3')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()
  await noShell(page)
})

test('First run: the first campaign is pre-filled with a name and keywords and keeps the rest under More options', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await firstRun(page)
  await page.route('**/api/auth/x/status', (r) => r.fulfill({ json: sandbox(true) }))
  await page.route('**/api/sender-profile', (r) =>
    r.fulfill({ json: { intro: ANSWERS.intro, programs: [{ id: 1, ...ANSWERS.program, deadline: null }], signer: ANSWERS.signer, sampleMessages: [] } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()

  // Name and keywords, pre-filled for the brief, each with a red star; one program is not asked about, it is just named.
  expect(await page.getByRole('textbox').count()).toBe(2)
  expect(await page.locator('label span[aria-hidden]', { hasText: '*' }).count()).toBe(2)
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('AI and robotics builders')
  const keywordTags = page.getByRole('list', { name: 'Keywords (added)' }).getByRole('listitem')
  await expect(keywordTags).toHaveCount(6)
  for (const [i, word] of ['robotics', 'embodied AI', 'LLM', 'AI agents', 'developer tools', 'AI infrastructure'].entries()) await expect(keywordTags.nth(i)).toContainText(word)
  await expect(page.getByRole('textbox', { name: 'Handles' })).toHaveCount(0)
  await expect(page.getByText('This campaign offers FastTrack AI Accelerator.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Seed accounts' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Tip' })).toBeVisible()

  await page.locator('summary', { hasText: 'More options' }).click()
  for (const name of ['Handles', 'Seed accounts', 'Search queries']) await expect(page.getByRole('textbox', { name })).toBeVisible()
  await expect(page.getByText('Discovery budget in USD (optional)')).toBeVisible()
  const over = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)
  expect(over).toBeGreaterThanOrEqual(0)
})

test('First run: creating the first campaign opens the full app', async ({ page }) => {
  await firstRun(page)
  await page.route('**/api/auth/x/status', (r) => r.fulfill({ json: sandbox(true) }))
  await page.route('**/api/sender-profile', (r) =>
    r.fulfill({ json: { intro: ANSWERS.intro, programs: [{ id: 1, ...ANSWERS.program, deadline: null }], signer: ANSWERS.signer, sampleMessages: [] } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/campaigns') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Create campaign' }).click()
  const body = (await sent).postDataJSON()
  expect(body.name).toBe('AI and robotics builders')
  expect(body.handles).toContain('mina_builds')
  expect(body.queries).toEqual([])

  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
})

test('First run, live X: with nothing typed the keywords are used as searches', async ({ page }) => {
  await firstRun(page)
  await page.route('**/api/auth/x/status', (r) => r.fulfill({ json: { ...sandbox(true), mode: 'live', handle: 'fundaccount' } }))
  await page.route('**/api/sender-profile', (r) =>
    r.fulfill({ json: { intro: ANSWERS.intro, programs: [{ id: 1, ...ANSWERS.program, deadline: null }], signer: ANSWERS.signer, sampleMessages: [] } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/campaigns') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Create campaign' }).click()
  const body = (await sent).postDataJSON()
  expect(body.handles).toEqual([])
  expect(body.queries).toEqual(['robotics', 'embodied AI', 'LLM', 'AI agents', 'developer tools', 'AI infrastructure'])
})

test('First run: the keywords are tags the person can change before creating the campaign', async ({ page }) => {
  await firstRun(page)
  await page.route('**/api/auth/x/status', (r) => r.fulfill({ json: sandbox(true) }))
  await page.route('**/api/sender-profile', (r) =>
    r.fulfill({ json: { intro: ANSWERS.intro, programs: [{ id: 1, ...ANSWERS.program, deadline: null }], signer: ANSWERS.signer, sampleMessages: [] } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start your first campaign' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove LLM' }).click()
  const keywords = page.getByRole('textbox', { name: 'Keywords', exact: true })
  await keywords.fill('surgical robots')
  await keywords.press('Enter')
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/campaigns') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Create campaign' }).click()
  const body = (await sent).postDataJSON()
  expect(body.keywords).toEqual(['robotics', 'embodied AI', 'AI agents', 'developer tools', 'AI infrastructure', 'surgical robots'])
})
