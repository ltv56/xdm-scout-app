import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ActivityLog } from '../activity/activity-log.entity'
import { DoNotContact, XUser } from '../sending/entities'
import type { DncPerson } from './contract'

const MIN_REASON = 3

@Injectable()
export class DoNotContactService {
  constructor(private readonly ds: DataSource) {}

  async list(): Promise<DncPerson[]> {
    const rows = await this.ds
      .createQueryBuilder(DoNotContact, 'n')
      .leftJoin(XUser, 'u', 'u.xUserId = n.xUserId')
      .select(['n.xUserId AS xUserId', 'u.handle AS handle', 'n.reason AS reason', 'n.source AS source', 'n.createdAt AS since'])
      .orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.xUserId', 'DESC')
      .getRawMany<{ xUserId: string; handle: string | null; reason: string; source: string; since: Date }>()
    return rows.map((r) => ({ xUserId: r.xUserId, handle: r.handle ?? r.xUserId, reason: r.reason, source: r.source, since: new Date(r.since).toISOString() }))
  }

  // Lifting a stop is the riskiest edit on the list, so it needs a reason and the reason is kept.
  async remove(xUserId: string, reason: string): Promise<void> {
    const why = reason.trim()
    if (why.length < MIN_REASON) throw new BadRequestException('Say why this person can be contacted again')
    await this.ds.transaction(async (em) => {
      const res = await em.delete(DoNotContact, { xUserId })
      if (!res.affected) throw new NotFoundException('This person is not on Do not contact')
      await em.save(ActivityLog, { kind: 'dnc_removed', subject: xUserId, detail: why.slice(0, 500) })
    })
  }
}
