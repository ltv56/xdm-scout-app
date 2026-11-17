import 'reflect-metadata'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Campaign, Prospect } from '../discovery/entities'
import { RepliesService } from '../inbox/replies.service'
import { Reply } from '../inbox/reply.entity'
import { Job } from '../jobs/job.entity'
import { JobsService } from '../jobs/jobs.service'
import { FakeLlmClient } from '../llm/fake-llm-client'
import { AttemptStatus, Contact, DoNotContact, Draft, SendAttempt } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { seedDraft, sha } from '../test/seed'
import { FakeXClient } from '../x/fake-x-client'
import { SandboxReplier } from './sandbox-replier'
import { loadSandboxScript, scriptedHandler } from './sandbox-script'

const script = loadSandboxScript(join(process.cwd(), '../../fixtures'))
let ds: DataSource
let x: FakeXClient
let replier: SandboxReplier
let replies: RepliesService

async function seedSend(xUserId: string, at: Date, route: 'api' | 'manual' = 'manual', status: AttemptStatus = 'manual_unverified') {
  if (!(await ds.getRepository(Campaign).findOneBy({ id: 1 }))) await ds.getRepository(Campaign).save({ id: 1, name: 'c1', keywords: [], handles: [] })
  const draft = await seedDraft(ds, xUserId, `Hello ${xUserId}`)
  const prospect = await ds.getRepository(Prospect).save({ campaignId: 1, xUserId })
  await ds.getRepository(Draft).update(draft.id, { prospectId: prospect.id, status: 'approved', approvedHash: sha(draft.content) })
  const attempt = await ds.getRepository(SendAttempt).save({ contactId: draft.contactId, draftId: draft.id, route, status, contentHash: sha(draft.content) })
  await ds.query('UPDATE send_attempts SET createdAt = ?, updatedAt = ? WHERE id = ?', [at, at, attempt.id])
  await ds.getRepository(Contact).update(draft.contactId, { activeAttemptId: attempt.id })
  return { contactId: draft.contactId, content: draft.content }
}

beforeEach(async () => {
  ds = await createTestDataSource()
  x = new FakeXClient()
  const jobs = new JobsService(ds)
  replier = new SandboxReplier(ds, x, script, jobs)
  replies = new RepliesService(ds, x, jobs, new FakeLlmClient(scriptedHandler(script)))
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const now = new Date('2026-11-19T10:00:00Z')
const ago = (s: number) => new Date(now.getTime() - s * 1000)

describe('SandboxReplier', () => {
  it('answers a hand-send to a scripted person and queues the reply read', async () => {
    const { contactId, content } = await seedSend('9001', ago(30))
    await replier.tick(now)
    const chat = await x.getConversation('9001')
    expect(chat.map((m) => [m.fromMe, m.text])).toEqual([
      [false, script.replyFor('9001')],
      [true, content],
    ])
    expect(await ds.getRepository(Job).findOneBy({ type: 'read_replies' })).toMatchObject({ payload: { contactId } })

    await replies.read(contactId, now)
    expect(await ds.getRepository(Reply).findOneBy({ contactId })).toMatchObject({ replyClass: 'Interested' })
  })

  it('an API send gets the reply without a second copy of our message', async () => {
    await seedSend('9002', ago(30), 'api', 'sent')
    await replier.tick(now)
    expect((await x.getConversation('9002')).map((m) => m.fromMe)).toEqual([false])
  })

  it('a stop request lands on Do not contact', async () => {
    const { contactId } = await seedSend('9003', ago(30))
    await replier.tick(now)
    await replies.read(contactId, now)
    expect(await ds.getRepository(DoNotContact).findOneBy({ xUserId: '9003' })).not.toBeNull()
  })

  it('waits a little after the send, skips people with no script and answers only once', async () => {
    await seedSend('9001', ago(5))
    await seedSend('9006', ago(30))
    await replier.tick(now)
    expect(await x.getConversation('9001')).toEqual([])
    expect(await x.getConversation('9006')).toEqual([])

    await replier.tick(new Date(now.getTime() + 60_000))
    await replier.tick(new Date(now.getTime() + 120_000))
    expect((await x.getConversation('9001')).filter((m) => !m.fromMe)).toHaveLength(1)
    expect(await ds.getRepository(Job).countBy({ type: 'read_replies' })).toBe(1)
  })
})
