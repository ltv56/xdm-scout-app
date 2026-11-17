import { DataSource } from 'typeorm'
import { Reply } from '../inbox/reply.entity'
import { JobsService } from '../jobs/jobs.service'
import { Contact, Draft, SendAttempt } from '../sending/entities'
import { FakeXClient } from '../x/fake-x-client'
import { SandboxScript } from './sandbox-script'

// Long enough to read the "sent" state first, short enough that a visitor sees the reply in the same sitting.
export const REPLY_AFTER_MS = 20_000

type Row = { attemptId: number; contactId: number; xUserId: string; route: 'api' | 'manual'; content: string; createdAt: Date }

// Sandbox only: plays the scripted people. A hand-send is put into the fake chat as if it was sent in X, then the person answers.
export class SandboxReplier {
  constructor(
    private readonly ds: DataSource,
    private readonly x: FakeXClient,
    private readonly script: SandboxScript,
    private readonly jobs: JobsService,
  ) {}

  async tick(now: Date): Promise<void> {
    for (const row of await this.unanswered(now)) {
      const text = this.script.replyFor(row.xUserId)
      if (!text) continue
      const chat = await this.x.getConversation(row.xUserId)
      if (chat.some((m) => !m.fromMe && m.createdAt >= row.createdAt)) continue
      if (row.route === 'manual' && !chat.some((m) => m.fromMe && m.text === row.content)) this.x.deliverSilently(row.xUserId, row.content, row.createdAt)
      this.x.priorMessage(row.xUserId, text, now)
      if (!(await this.jobs.hasOpen('read_replies', 'contactId', row.contactId))) await this.jobs.enqueue('read_replies', { contactId: row.contactId }, now)
    }
  }

  private async unanswered(now: Date): Promise<Row[]> {
    const rows = await this.ds
      .createQueryBuilder(SendAttempt, 'a')
      .innerJoin(Contact, 'c', 'c.id = a.contactId')
      .innerJoin(Draft, 'd', 'd.id = a.draftId')
      .leftJoin(Reply, 'r', 'r.contactId = c.id')
      .where('a.status IN (:...statuses) AND r.id IS NULL AND a.createdAt <= :cutoff', { statuses: ['sent', 'manual_unverified'], cutoff: new Date(now.getTime() - REPLY_AFTER_MS) })
      .select(['a.id AS attemptId', 'c.id AS contactId', 'c.xUserId AS xUserId', 'a.route AS route', 'd.content AS content', 'a.createdAt AS createdAt'])
      .getRawMany<Row>()
    return rows.map((r) => ({ ...r, contactId: Number(r.contactId), createdAt: new Date(r.createdAt) }))
  }
}
