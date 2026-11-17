import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Prospect } from '../discovery/entities'
import { Reply } from '../inbox/reply.entity'
import type { ReplyClass } from '../inbox/reply-class'
import { AttemptStatus, Contact, Draft, SendAttempt, XUser } from '../sending/entities'
import { composeUrl } from '../review/review.service'
import type { Outbox, OutboxItem } from './contract'

export const LABEL: Partial<Record<AttemptStatus, OutboxItem['label']>> = {
  queued: 'Waiting to send',
  sending: 'Sending',
  unknown: 'Checking',
  sent: 'Sent',
  manual_pending: 'Send in X',
  manual_unverified: 'Sent by hand',
  needs_decision: 'Check in X',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
// The greeting line says nothing about the message, so skip it when there is more.
const preview = (content: string) => {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
  return (lines.length > 1 ? lines[1] : (lines[0] ?? '')).slice(0, 140)
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
      .leftJoin(Reply, 'r', 'r.attemptId = a.id')
      .where('a.status <> :approved', { approved: 'approved' })
  }

  async list(campaignId: number): Promise<Outbox> {
    const rows = await this.attempts(campaignId)
      .select(['a.id AS id', 'a.status AS status', 'a.route AS route', 'a.error AS error', 'a.updatedAt AS at', 'a.draftId AS draftId', 'u.handle AS handle', 'u.name AS name', 'c.xUserId AS xUserId', 'd.content AS content', 'a.chatOpenedAt AS chatOpenedAt', 'r.replyClass AS reply'])
      .orderBy('a.updatedAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .limit(LIMIT)
      .getRawMany<{ id: number; status: AttemptStatus; route: 'api' | 'manual'; error: string | null; at: Date; draftId: number; handle: string | null; name: string | null; xUserId: string; content: string; chatOpenedAt: Date | null; reply: ReplyClass | null }>()
    const items = rows.map<OutboxItem>((r) => ({
      attemptId: r.id,
      draftId: r.draftId,
      handle: r.handle ?? r.xUserId,
      name: r.name,
      preview: preview(r.content),
      reply: r.reply,
      label: r.status === 'manual_pending' && r.chatOpenedAt ? 'Did you send it?' : (LABEL[r.status] ?? 'Checking'),
      route: r.route,
      error: r.error,
      at: new Date(r.at).toISOString(),
      // A hand-send already opened gets the chat without the text, so it is not filled in twice.
      openInX: r.status === 'manual_pending' ? composeUrl(r.xUserId, r.content) : r.status === 'manual_unverified' ? `https://x.com/messages/compose?recipient_id=${r.xUserId}` : null,
      text: r.status === 'manual_pending' ? r.content : null,
    }))
    // Counted apart from the rows, so an old attempt still on its way is not hidden by the newest 100.
    const inFlight = (await this.attempts(campaignId).andWhere('a.status IN (:...flying)', { flying: IN_FLIGHT }).getCount()) > 0
    return { inFlight, items }
  }
}
