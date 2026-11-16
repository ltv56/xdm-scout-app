import { expect, test } from '@playwright/test'
import { CAMPAIGN, ensureReady } from './setup.ts'

test('Before the first search the Overview is one card with the search button', async ({ page, request }) => {
  await ensureReady(request)
  const name = `fresh ${Date.now()}`
  expect((await request.post('/api/campaigns', { data: { ...CAMPAIGN, name } })).ok()).toBe(true)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

  const card = page.getByRole('region', { name: 'Next step' })
  await expect(card.getByRole('heading', { name: 'Find your first people' })).toBeVisible()
  // What the search will use, so it is clear before it runs, and a way to change it.
  const uses = card.getByRole('region', { name: 'What this search uses' })
  await expect(uses.getByRole('listitem').filter({ hasText: 'robotics' }).first()).toBeVisible()
  await expect(uses).toContainText('Keywords')
  await expect(uses).toContainText('Handles')
  await expect(uses).toContainText('@mina_builds')
  await expect(uses).toContainText('Fund criteria')
  await expect(uses).toContainText('Offers')

  // The handles that did not fit are one hover away.
  await uses.getByText('+3 more').hover()
  await expect(page.getByRole('tooltip')).toContainText('@private_dev, @pasta_daily, @nobody_here')
  await expect(card).toContainText('budget')
  await expect(card.getByRole('button', { name: 'Run first search' })).toBeVisible()

  // The whole path in three quiet steps, the first one current.
  const steps = card.getByRole('list', { name: 'What happens next' }).getByRole('listitem')
  await expect(steps).toHaveText([/Search/, /Review drafts/, /Approve and send/])
  await expect(steps.first()).toHaveAttribute('aria-current', 'step')

  // Nothing is found yet, so no empty blocks and no rows of zeros.
  for (const empty of ['What we found', 'Last search', 'Results so far']) await expect(page.getByRole('region', { name: empty })).toHaveCount(0)
  await expect(page.getByText('Nobody yet.')).toHaveCount(0)
  await expect(page.getByText('No search has run for this campaign yet.')).toHaveCount(0)
})

test('After the first search the results show up without waiting for a refresh', async ({ page, request }) => {
  await ensureReady(request)
  expect((await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `search ${Date.now()}` } })).ok()).toBe(true)
  await page.goto('/')
  await page.getByRole('button', { name: 'Run first search' }).click()
  await expect(page.getByRole('region', { name: 'Results so far' })).toBeVisible({ timeout: 20_000 })
  const last = page.getByRole('region', { name: 'Last search' })
  await expect(last).toContainText('added')
  await last.getByText('Last search').click()
  await expect(last.getByText(/^Added: .*@mina_builds/)).toBeVisible()
})

test('Edit search on the first-search card opens the campaign in Settings', async ({ page, request }) => {
  await ensureReady(request)
  const name = `edit ${Date.now()}`
  expect((await request.post('/api/campaigns', { data: { ...CAMPAIGN, name } })).ok()).toBe(true)
  await page.goto('/')
  await page.getByRole('region', { name: 'Next step' }).getByRole('button', { name: 'Edit search' }).click()
  await expect(page.getByRole('tab', { name: 'Campaign' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: 'Campaign' })).toBeVisible()
})

test('A running search shows on every screen, and says when it is done', async ({ page, request }) => {
  await ensureReady(request)
  const { id } = await (await request.post('/api/campaigns', { data: { ...CAMPAIGN, name: `running ${Date.now()}` } })).json()
  // Hold the search open, then end it with a result.
  let phase: 'running' | 'done' = 'running'
  await page.route(`**/api/campaigns/${id}`, async (route) => {
    const body = await (await route.fetch()).json()
    const done = { at: new Date().toISOString(), added: 3, skipped: [], spentMicros: 80_000, stoppedByBudget: false, postsPending: 0 }
    await route.fulfill({ json: phase === 'running' ? { ...body, searching: true } : { ...body, searching: false, lastDiscovery: done } })
  })
  await page.goto('/')

  const card = page.getByRole('region', { name: 'Next step' })
  await expect(card.getByRole('status')).toContainText('Searching')
  await expect(card.getByRole('button', { name: 'Run first search' })).toHaveCount(0)
  const bar = page.getByLabel('Status')
  await expect(bar).toContainText('Searching')

  // Leaving the screen does not lose it.
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Candidates' }).click()
  await expect(bar).toContainText('Searching')

  phase = 'done'
  await expect(bar).toContainText('Search done', { timeout: 15_000 })
  await bar.getByRole('button', { name: /Search done/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^running / })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Find your first people' })).toHaveCount(0)
})
