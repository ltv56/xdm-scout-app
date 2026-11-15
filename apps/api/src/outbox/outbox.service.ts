import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Prospect } from '../discovery/entities'
import { AttemptStatus, Contact, Draft, SendAttempt, XUser } from '../sending/entities'
import type { Outbox, OutboxItem } from './contract'

const LABEL: Partial<Record<AttemptStatus, OutboxItem['label']>> = {
  queued: 'Waiting to send',
  sending: 'Sending',
  unknown: 'Checking',
  sent: 'Sent',
  manual_pending: 'Send in X',
  manual_unverified: 'Check in X',
  needs_decision: 'Check in X',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
const IN_FLIGHT: AttemptStatus[] = ['queued', 'sending', 'unknown']
const LIMIT = 100

@Injectable()
export class OutboxService {
  constructor(private readonly ds: DataSource) {}

  private attempts(campaignId: number) {
    return this.ds
      .getRepository(SendAttempt)
      .createQueryBuilder('a')
      .innerJoin(Draft, 'd', 'd.id = a.draftId')
      .innerJoin(Prospect, 'p', 'p.id = d.prospectId AND p.campaignId = :campaignId', { campaignId })
      .innerJoin(Contact, 'c', 'c.id = a.contactId')
      .leftJoin(XUser, 'u', 'u.xUserId = c.xUserId')
      .where('a.status <> :approved', { approved: 'approved' })
  }

  async list(campaignId: number): Promise<Outbox> {
    const rows = await this.attempts(campaignId)
      .select(['a.id AS id', 'a.status AS status', 'a.route AS route', 'a.error AS error', 'a.updatedAt AS at', 'u.handle AS handle', 'c.xUserId AS xUserId'])
      .orderBy('a.updatedAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .limit(LIMIT)
      .getRawMany<{ id: number; status: AttemptStatus; route: 'api' | 'manual'; error: string | null; at: Date; handle: string | null; xUserId: string }>()
    const items = rows.map<OutboxItem>((r) => ({
      attemptId: r.id,
      handle: r.handle ?? r.xUserId,
      label: LABEL[r.status] ?? 'Checking',
      route: r.route,
      error: r.error,
      at: new Date(r.at).toISOString(),
    }))
    // Counted apart from the rows, so an old attempt still on its way is not hidden by the newest 100.
    const inFlight = (await this.attempts(campaignId).andWhere('a.status IN (:...flying)', { flying: IN_FLIGHT }).getCount()) > 0
    return { inFlight, items }
  }
}
