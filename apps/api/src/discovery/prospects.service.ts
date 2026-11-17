import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { Claim, Evidence } from '../fit/entities'
import { openingFreshness } from '../fit/fit.service'
import { KnownUser } from '../known/known-user.entity'
import { Job } from '../jobs/job.entity'
import { LABEL } from '../outbox/outbox.service'
import { Contact, Draft, SendAttempt, XUser } from '../sending/entities'
import { leadReason, noOpening } from './candidate-why'
import { Prospect, XPost } from './entities'
import { LANDS_IN_RANK, landsIn } from './lands-in'

const FIT_RANK = { strong: 0, possible: 1, weak: 2, not_a_fit: 3 }

@Injectable()
export class ProspectsService {
  constructor(private readonly ds: DataSource) {}

  async list(campaignId: number, now = new Date()) {
    const found = await this.ds.getRepository(Prospect).find({ where: { campaignId } })
    const users = new Map((await this.ds.getRepository(XUser).findBy({ xUserId: In(found.map((p) => p.xUserId)) })).map((u) => [u.xUserId, u]))
    const lands = (p: Prospect) => landsIn(p.relationship, users.get(p.xUserId))
    // Spec s5: where the message lands first, then Fit, then how many seeds follow them, then the newest opening.
    const prospects = found.sort(
      (a, b) =>
        LANDS_IN_RANK[lands(a) ?? 'unknown'] - LANDS_IN_RANK[lands(b) ?? 'unknown'] ||
        (a.fit ? FIT_RANK[a.fit] : 9) - (b.fit ? FIT_RANK[b.fit] : 9) ||
        b.seedCount - a.seedCount ||
        (b.openingDate?.getTime() ?? 0) - (a.openingDate?.getTime() ?? 0) ||
        a.id - b.id,
    )
    const claims = await this.ds.getRepository(Claim).findBy({ prospectId: In(prospects.map((p) => p.id)) })
    const evidence = new Map((await this.ds.getRepository(Evidence).find()).map((e) => [e.id, e]))
    const fundLists = new Map((await this.ds.getRepository(KnownUser).findBy({ xUserId: In(prospects.map((p) => p.xUserId)) })).map((k) => [k.xUserId, k]))
    const contacts = new Map((await this.ds.getRepository(Contact).findBy({ xUserId: In(prospects.map((p) => p.xUserId)) })).map((c) => [c.xUserId, c]))
    const postStats = await this.postStats(prospects.map((p) => p.xUserId))
    const outbox = await this.outboxLabels(prospects.map((p) => p.id))
    const scoring = await this.openJobs('score', prospects.map((p) => p.id))
    const drafting = await this.openJobs('draft', prospects.map((p) => p.id))

    const rows = prospects.map((p) => {
      const user = users.get(p.xUserId)
      const opening = p.openingType && p.openingType !== 'none' && p.openingDate
        ? {
            type: p.openingType,
            summary: p.openingSummary,
            date: p.openingDate,
            freshness: openingFreshness(p.openingDate, now),
            url: p.openingEvidenceId ? (evidence.get(p.openingEvidenceId)?.url ?? null) : null,
          }
        : null
      return {
        id: p.id,
        handle: user?.handle ?? '',
        name: user?.name ?? '',
        bio: user?.bio ?? '',
        followers: user?.followers ?? 0,
        lastPostAt: postStats.get(p.xUserId)?.last ?? null,
        criteria: p.criteria ?? [],
        relationship: p.relationship,
        landsIn: lands(p),
        seedCount: p.seedCount,
        status: p.status,
        scoring: scoring.has(p.id),
        drafting: drafting.has(p.id),
        outbox: outbox.get(p.id) ?? null,
        fit: p.fit,
        role: p.role,
        areas: p.areas ?? [],
        opening,
        fundList: fundLists.has(p.xUserId) ? { name: fundLists.get(p.xUserId)!.listName, kind: fundLists.get(p.xUserId)!.kind, event: fundLists.get(p.xUserId)!.event } : null,
        call:
          p.source === 'call' && p.callEventId && p.callAt
            ? { text: p.callText ?? '', at: p.callAt, invitationConfirmed: contacts.get(p.xUserId)?.invitationEventId === p.callEventId }
            : null,
        identityWarning: /parody|\bfan\b/i.test(user?.bio ?? ''),
        why: pickWhy(p.fit, claims.filter((c) => c.prospectId === p.id)),
        noOpening: noOpening(p, postStats.get(p.xUserId)?.count ?? 0, now),
        claims: claims
          .filter((c) => c.prospectId === p.id)
          .map((c) => ({
            side: c.side,
            text: c.text,
            status: c.status,
            evidence: c.evidenceIds.flatMap((id) => {
              const e = evidence.get(id)
              return e ? [{ id, url: e.url }] : []
            }),
          })),
      }
    })

    return rows
  }

  // Where the newest send of each person stands in the Outbox. A send that failed or was cancelled leaves them uncontacted.
  private async outboxLabels(ids: number[]) {
    const labels = new Map<number, string>()
    if (!ids.length) return labels
    const drafts = await this.ds.getRepository(Draft).findBy({ prospectId: In(ids) })
    const attempts = drafts.length ? await this.ds.getRepository(SendAttempt).findBy({ draftId: In(drafts.map((d) => d.id)) }) : []
    const prospectOf = new Map(drafts.map((d) => [d.id, d.prospectId]))
    for (const a of attempts.sort((x, y) => x.id - y.id)) {
      const prospectId = prospectOf.get(a.draftId)
      if (prospectId === undefined || prospectId === null) continue
      const label = a.status === 'failed' || a.status === 'cancelled' ? undefined : LABEL[a.status]
      if (label) labels.set(prospectId, label)
      else labels.delete(prospectId)
    }
    return labels
  }

  // Candidates with a score job waiting for the worker or running.
  private async openJobs(type: 'score' | 'draft', ids: number[]) {
    if (!ids.length) return new Set<number>()
    const rows = await this.ds
      .getRepository(Job)
      .createQueryBuilder('j')
      .select("JSON_EXTRACT(j.payload, '$.prospectId')", 'pid')
      .where("j.type = :type AND j.status IN ('pending', 'running')", { type })
      .getRawMany<{ pid: number | string }>()
    const wanted = new Set(ids)
    return new Set(rows.map((r) => Number(r.pid)).filter((id) => wanted.has(id)))
  }

  // The newest stored post and how many were read, per person.
  private async postStats(xUserIds: string[]) {
    if (!xUserIds.length) return new Map<string, { last: Date; count: number }>()
    const rows = await this.ds
      .getRepository(XPost)
      .createQueryBuilder('p')
      .select('p.xUserId', 'xUserId')
      .addSelect('MAX(p.postedAt)', 'last')
      .addSelect('COUNT(*)', 'count')
      .where('p.xUserId IN (:...ids)', { ids: xUserIds })
      .groupBy('p.xUserId')
      .getRawMany<{ xUserId: string; last: Date; count: string }>()
    return new Map(rows.map((r) => [r.xUserId, { last: new Date(r.last), count: Number(r.count) }]))
  }

  // One candidate with everything the detail screen shows: the list row plus the posts that were read and the text each reason cites.
  async detail(campaignId: number, prospectId: number, now = new Date()) {
    const row = (await this.list(campaignId, now)).find((r) => r.id === prospectId)
    if (!row) throw new NotFoundException('Candidate not found')
    const prospect = await this.ds.getRepository(Prospect).findOneByOrFail({ id: prospectId })
    const posts = await this.ds.getRepository(XPost).find({ where: { xUserId: prospect.xUserId }, order: { postedAt: 'DESC' } })
    const cited = new Set((await this.ds.getRepository(Claim).findBy({ prospectId })).flatMap((c) => c.evidenceIds))
    const excerpts = new Map((await this.ds.getRepository(Evidence).findBy({ id: In([...cited, '']) })).map((e) => [e.id, e.excerpt]))
    return {
      ...row,
      posts: posts.map((x) => ({
        id: x.postId,
        text: x.text,
        date: x.postedAt,
        url: `https://x.com/${row.handle}/status/${x.postId}`,
        opening: prospect.openingEvidenceId === `post:${x.postId}`,
        cited: cited.has(`post:${x.postId}`),
      })),
      claims: row.claims.map((c) => ({ ...c, evidence: c.evidence.map((e) => ({ ...e, excerpt: excerpts.get(e.id) ?? null })) })),
    }
  }

}

function pickWhy(fit: Prospect['fit'], claims: Claim[]) {
  const c = leadReason(fit, claims)
  return c ? { text: c.text, side: c.side, status: c.status } : null
}
