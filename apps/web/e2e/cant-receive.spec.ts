import { expect, test, type APIRequestContext } from '@playwright/test'
import emptyDatabase from './global-setup.ts'

const NAME = `closed dms ${Date.now()}`

async function waitForScoredPeople(request: APIRequestContext, id: number) {
  await expect(async () => {
    const people = await (await request.get(`/api/campaigns/${id}/prospects`)).json()
    if (people.length < 2) {
      await request.post(`/api/campaigns/${id}/discover`)
      throw new Error('discovery not finished')
    }
    if (people.some((p: { fit: string | null }) => p.fit === null)) {
      await request.post(`/api/campaigns/${id}/score`)
      throw new Error('scoring not finished')
    }
  }).toPass({ timeout: 60_000, intervals: [2_000] })
}

test.afterAll(async () => {
  await emptyDatabase()
})

test('Someone whose DMs are closed is left out of Write drafts; a draft by hand cannot be approved or opened in X', async ({ page, request }) => {
  expect((await request.post('/api/auth/x/fake')).ok()).toBe(true)
  await request.put('/api/sender-profile', {
    data: { intro: 'GenAI Fund backs early AI founders in Southeast Asia.', programs: [{ id: 1, name: 'Agentic AI Build Week', description: 'A build week for AI agents.', link: 'https://genaifund.ai/', deadline: null }], signer: 'Vinh', sampleMessages: [] },
  })
  const { id } = await (await request.post('/api/campaigns', { data: { name: NAME, keywords: ['robotics'], handles: ['mina_builds', 'dm_closed'] } })).json()
  await waitForScoredPeople(request, id)

  await page.goto('/')
  await page.getByRole('button', { name: /^Campaign/ }).click()
  await page.getByRole('button', { name: NAME, exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Candidates' }).click()
  await page.getByRole('button', { name: /^Write \d+ drafts?$/ }).click()
  await expect(page.getByText(/^Writing 1 draft\./)).toBeVisible()
  await expect(page.getByText('1 person left out: X says their DMs are closed.')).toBeVisible()
  const closed = page.getByRole('listitem').filter({ hasText: '@dm_closed' })
  await expect(closed.getByRole('note')).toContainText('X says their DMs are closed')
  await page.getByRole('button', { name: /^Ready for a draft/ }).click()
  await expect(closed).toHaveCount(0)
  await page.getByRole('button', { name: /^All/ }).click()

  await closed.getByRole('button', { name: 'Draft a message' }).click()
  await expect(closed.getByText('Draft written')).toBeVisible()

  await closed.getByRole('button', { name: 'Open in Review' }).click()
  await expect(page.getByText(/X says their DMs are closed, so a message can't reach them\. Approve and Open chat stay off/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeDisabled()
  await expect(page.getByRole('button', { name: /^Open chat with @dm_closed/ })).toBeDisabled()
})
