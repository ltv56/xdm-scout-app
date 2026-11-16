import { Injectable } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { Claim, Evidence } from '../fit/entities'
import { openingFreshness } from '../fit/fit.service'
import { KnownUser } from '../known/known-user.entity'
import { Job } from '../jobs/job.entity'
import { Contact, XUser } from '../sending/entities'
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
    const lastPosts = await this.lastPostDates(prospects.map((p) => p.xUserId))
    const scoring = await this.openScoreJobs(prospects.map((p) => p.id))

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
        lastPostAt: lastPosts.get(p.xUserId) ?? null,
        criteria: p.criteria ?? [],
        relationship: p.relationship,
        landsIn: lands(p),
        seedCount: p.seedCount,
        status: p.status,
        scoring: scoring.has(p.id),
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

  // Candidates with a score job waiting for the worker or running.
  private async openScoreJobs(ids: number[]) {
    if (!ids.length) return new Set<number>()
    const rows = await this.ds
      .getRepository(Job)
      .createQueryBuilder('j')
      .select("JSON_EXTRACT(j.payload, '$.prospectId')", 'pid')
      .where("j.type = 'score' AND j.status IN ('pending', 'running')")
      .getRawMany<{ pid: number | string }>()
    const wanted = new Set(ids)
    return new Set(rows.map((r) => Number(r.pid)).filter((id) => wanted.has(id)))
  }

  private async lastPostDates(xUserIds: string[]) {
    if (!xUserIds.length) return new Map<string, Date>()
    const rows = await this.ds
      .getRepository(XPost)
      .createQueryBuilder('p')
      .select('p.xUserId', 'xUserId')
      .addSelect('MAX(p.postedAt)', 'last')
      .where('p.xUserId IN (:...ids)', { ids: xUserIds })
      .groupBy('p.xUserId')
      .getRawMany<{ xUserId: string; last: Date }>()
    return new Map(rows.map((r) => [r.xUserId, new Date(r.last)]))
  }
}
