import { expect, test, type Page } from '@playwright/test'
import { ensureCampaign } from './setup.ts'

// The e2e API runs without the gate; these specs answer /api/access themselves to show each state of the screen.
async function gate(page: Page, state: { setUp: boolean; signedIn: boolean }) {
  await page.route('**/api/access', (r) => r.fulfill({ json: { gate: true, ...state } }))
}

test('A new hosted server asks for the invite code and a password, and checks the two passwords match', async ({ page }) => {
  let signedIn = false
  let body: unknown = null
  await page.route('**/api/access', (r) => r.fulfill({ json: { gate: true, setUp: signedIn, signedIn } }))
  await page.route('**/api/access/set-up', (r) => {
    body = r.request().postDataJSON()
    signedIn = true
    return r.fulfill({ json: { ok: true } })
  })
  await page.goto('/')
  const form = page.getByRole('form', { name: 'Set up' })
  await expect(form.getByRole('heading', { name: 'Set up this server' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0)

  await form.getByLabel('Invite code').fill('invite-7f3a9c')
  await form.getByLabel(/^New password/).fill('correct horse battery')
  await form.getByLabel('Password again').fill('correct horse batterz')
  await form.getByRole('button', { name: 'Set up' }).click()
  await expect(form.getByRole('alert')).toHaveText('The two passwords are not the same.')
  expect(body).toBeNull()

  await form.getByLabel('Password again').fill('correct horse battery')
  await form.getByRole('button', { name: 'Set up' }).click()
  await expect(form).toHaveCount(0)
  expect(body).toEqual({ invite: 'invite-7f3a9c', password: 'correct horse battery' })
})

test('Sign-in shows what the server said, such as a wrong password or a lock', async ({ page }) => {
  await gate(page, { setUp: true, signedIn: false })
  await page.route('**/api/access/sign-in', (r) => r.fulfill({ status: 429, json: { message: 'Too many wrong passwords. Try again in 15 min.' } }))
  await page.goto('/')
  const form = page.getByRole('form', { name: 'Sign in' })
  await form.getByLabel('Password').fill('not the password')
  await form.getByRole('button', { name: 'Sign in' }).click()
  await expect(form.getByRole('alert')).toHaveText('Too many wrong passwords. Try again in 15 min.')
})

test('When the session ends, the next API call brings the sign-in screen back', async ({ page, request }) => {
  await ensureCampaign(request)
  let signedIn = true
  await page.route('**/api/access', (r) => r.fulfill({ json: { gate: true, setUp: true, signedIn } }))
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  // The session ends exactly when the API first says so.
  await page.route('**/api/campaigns/*/prospects', (r) => {
    signedIn = false
    return r.fulfill({ status: 401, json: { message: 'Sign in first.' } })
  })
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Candidates' }).click()
  await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
})

test('The account menu offers sign out only on a server with the gate', async ({ page, request }) => {
  await ensureCampaign(request)
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)

  await gate(page, { setUp: true, signedIn: true })
  let out = ''
  await page.route('**/api/access/sign-out*', (r) => {
    out = new URL(r.request().url()).pathname
    return r.fulfill({ json: { ok: true } })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Sign out everywhere' }).click()
  expect(out).toBe('/api/access/sign-out-everywhere')
})

test('Keys: only the last 4 characters come back, only typed fields are sent, a saved key can be cleared', async ({ page, request }) => {
  await ensureCampaign(request)
  const view = (openai: { set: boolean; last4: string | null; source: 'saved' | 'env' | null }) => ({
    keys: { xClientId: { set: true, last4: 'WXYZ', source: 'env' }, xClientSecret: { set: false, last4: null, source: null }, openaiApiKey: openai },
    callbackUrl: 'https://xdm.example.org/api/auth/x/callback',
    canSave: true,
  })
  let current = view({ set: false, last4: null, source: null })
  const sent: unknown[] = []
  await page.route('**/api/keys', (r) => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON() as { openaiApiKey?: string }
      sent.push(body)
      current = view(body.openaiApiKey ? { set: true, last4: body.openaiApiKey.slice(-4), source: 'saved' } : { set: false, last4: null, source: null })
    }
    return r.fulfill({ json: current })
  })
  await page.goto('/#settings/keys')
  await page.getByRole('tab', { name: 'Keys' }).click()
  const keys = page.getByRole('region', { name: 'Keys' })
  await expect(keys).toContainText('https://xdm.example.org/api/auth/x/callback')
  await expect(keys).toContainText('From the server .env, ends in WXYZ')

  await keys.getByLabel('OpenAI API key').fill('sk-proj-abcd1234')
  await keys.getByRole('button', { name: 'Save keys' }).click()
  await expect(keys).toContainText('Saved, ends in 1234')
  await expect(keys.getByLabel('OpenAI API key')).toHaveValue('')
  expect(sent).toEqual([{ openaiApiKey: 'sk-proj-abcd1234' }])

  await keys.getByRole('button', { name: 'Clear' }).click()
  await expect(keys.getByText('Not set')).toHaveCount(2)
  expect(sent[1]).toEqual({ openaiApiKey: '' })
})
