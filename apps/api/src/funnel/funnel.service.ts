import { Injectable } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { ApiUsage, Prospect } from '../discovery/entities'
import { Reply } from '../inbox/reply.entity'
import { Draft, SendAttempt } from '../sending/entities'
import type { Funnel, FunnelLane } from './contract'

const SENT = ['sent', 'manual_unverified']
const CONVERSATION = ['Interested', 'Question']

// Reading DMs belongs to the call lane; everything else X billed for the campaign belongs to search.
@Injectable()
export class FunnelService {
  constructor(private readonly ds: DataSource) {}

  async get(campaignId: number): Promise<Funnel> {
    const prospects = await this.ds.getRepository(Prospect).find({ where: { campaignId } })
    const drafts = prospects.length ? await this.ds.getRepository(Draft).find({ where: { prospectId: In(prospects.map((p) => p.id)) } }) : []
    const live = drafts.filter((d) => d.status !== 'superseded')
    const attempts = live.length ? await this.ds.getRepository(SendAttempt).find({ where: { draftId: In(live.map((d) => d.id)) } }) : []
    const replies = attempts.length ? await this.ds.getRepository(Reply).find({ where: { attemptId: In(attempts.map((a) => a.id)) } }) : []

    const prospectOfDraft = new Map(live.map((d) => [d.id, d.prospectId]))
    const prospectOfAttempt = new Map(attempts.map((a) => [a.id, prospectOfDraft.get(a.draftId)]))
    const approved = new Set(live.filter((d) => d.status === 'approved').map((d) => d.prospectId))
    const sent = new Set(attempts.filter((a) => SENT.includes(a.status)).map((a) => prospectOfDraft.get(a.draftId)))
    const replied = new Set(replies.map((r) => prospectOfAttempt.get(r.attemptId)))
    const talking = new Set(replies.filter((r) => r.replyClass && CONVERSATION.includes(r.replyClass)).map((r) => prospectOfAttempt.get(r.attemptId)))

    const usage = await this.ds
      .getRepository(ApiUsage)
      .createQueryBuilder('u')
      .select('u.kind', 'kind')
      .addSelect('COALESCE(SUM(u.costMicros), 0)', 'total')
      .where('u.campaignId = :campaignId', { campaignId })
      .groupBy('u.kind')
      .getRawMany<{ kind: ApiUsage['kind']; total: string }>()
    const cost = { search: 0, call: 0 }
    for (const u of usage) cost[u.kind === 'dm_event' ? 'call' : 'search'] += Number(u.total)

    const lane = (name: FunnelLane['lane']): FunnelLane => {
      const mine = prospects.filter((p) => p.source === name)
      const count = (set: Set<number | null | undefined>) => mine.filter((p) => set.has(p.id)).length
      const conversations = count(talking)
      return {
        lane: name,
        found: mine.length,
        goodFit: mine.filter((p) => p.fit === 'strong' || p.fit === 'possible').length,
        approved: count(approved),
        sent: count(sent),
        replied: count(replied),
        conversations,
        costMicros: cost[name],
        costPerConversationMicros: conversations ? Math.round(cost[name] / conversations) : null,
      }
    }
    const lanes = [lane('search'), lane('call')].filter((l) => l.lane === 'search' || l.found > 0)
    return { lanes, totalMicros: cost.search + cost.call }
  }
}
