import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Campaign, Prospect } from '../discovery/entities'
import { InboxService } from '../inbox/inbox.service'
import { NO_ACTION } from '../inbox/reply-class'
import { PreflightService } from '../preflight/preflight.service'
import { Contact, Draft, SendAttempt, XUser } from '../sending/entities'
import type { AttentionItem } from './contract'

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`
const short = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}...` : text)

type FailedRow = { id: number; at: Date; xUserId: string; handle: string | null; error: string | null }

// One list of everything that waits for a person: system problems first, then what people wrote, longest wait first.
@Injectable()
export class AttentionService {
  constructor(
    private readonly ds: DataSource,
    private readonly inbox: InboxService,
    private readonly preflight: PreflightService,
  ) {}

  async list(campaignId: number, now = new Date()): Promise<AttentionItem[]> {
    const items = [...(await this.system(now)), ...(await this.people(campaignId)), ...(await this.budget(campaignId))]
    const since = (i: AttentionItem) => (i.since ? new Date(i.since).getTime() : Infinity)
    return items.sort((a, b) => a.priority - b.priority || since(a) - since(b))
  }

  private async system(now: Date): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const account = (await this.preflight.run()).find((r) => r.id === 'x_account')
    if (account?.status === 'fail') {
      items.push({ id: 'x_disconnected', kind: 'x_disconnected', priority: 1, title: 'X account', reason: 'X connection expired. Reconnect to continue.', since: null, goTo: 'profile' })
    }
    if (!(await this.preflight.topBar(null, now)).workerRunning) {
      items.push({ id: 'worker_stopped', kind: 'worker_stopped', priority: 1, title: 'Worker', reason: 'The background worker is not running: nothing is being sent or read.', since: null, goTo: null })
    }
    return items
  }

  private async people(campaignId: number): Promise<AttentionItem[]> {
    const { replies, toCheck } = await this.inbox.checks(campaignId)
    const fromReplies = replies
      .filter((r) => !r.handled && !(r.replyClass && NO_ACTION.includes(r.replyClass)))
      .map<AttentionItem>((r) => ({
        id: `reply-${r.replyId}`,
        kind: 'reply',
        priority: r.replyClass === 'Interested' ? 1 : 2,
        title: r.handle,
        reason: `${r.replyClass ?? 'Not sorted'}: ${r.theirText ? short(r.theirText) : 'replied in an encrypted chat'}`,
        since: r.at,
        goTo: 'inbox',
      }))
    const fromChecks = toCheck.map<AttentionItem>((c) => ({
      id: `check-${c.attemptId}`,
      kind: 'check',
      priority: 2,
      title: c.handle,
      reason: c.reason === 'sent_by_hand' ? 'You marked this as sent by hand. Check in X that it went out.' : 'X did not confirm this send. Check in X whether it went out.',
      since: c.at,
      goTo: 'inbox',
    }))
    return [...fromReplies, ...fromChecks, ...(await this.failed(campaignId))]
  }

  private async failed(campaignId: number): Promise<AttentionItem[]> {
    const rows = await this.ds
      .createQueryBuilder(SendAttempt, 'a')
      .innerJoin(Draft, 'd', 'd.id = a.draftId')
      .innerJoin(Prospect, 'p', 'p.id = d.prospectId AND p.campaignId = :campaignId', { campaignId })
      .innerJoin(Contact, 'c', 'c.id = a.contactId')
      .leftJoin(XUser, 'u', 'u.xUserId = c.xUserId')
      .where("a.status = 'failed'")
      .select(['a.id AS id', 'a.updatedAt AS at', 'c.xUserId AS xUserId', 'u.handle AS handle', 'a.error AS error'])
      .orderBy('a.id', 'ASC')
      .getRawMany<FailedRow>()
    return rows.map((r) => ({
      id: `failed-${r.id}`,
      kind: 'failed',
      priority: 2,
      title: r.handle ?? r.xUserId,
      reason: r.error ?? 'This message could not be sent.',
      since: new Date(r.at).toISOString(),
      goTo: 'inbox',
    }))
  }

  private async budget(campaignId: number): Promise<AttentionItem[]> {
    const campaign = await this.ds.getRepository(Campaign).findOneBy({ id: campaignId })
    const run = campaign?.lastDiscovery
    if (!campaign || !run?.stoppedByBudget) return []
    return [
      {
        id: `budget-${campaign.id}`,
        kind: 'budget_out',
        priority: 3,
        title: campaign.name,
        reason: `Discovery stopped at the budget (${usd(run.spentMicros)} of ${usd(campaign.budgetMicros)}). Raise the budget to read more people.`,
        since: run.at,
        goTo: 'overview',
      },
    ]
  }
}
