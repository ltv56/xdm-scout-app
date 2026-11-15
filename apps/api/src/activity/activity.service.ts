import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { XUser } from '../sending/entities'
import { ActivityLog } from './activity-log.entity'
import type { ActivityRow } from './contract'


const LIMIT = 1000
const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

// Header and rows end in CRLF, as spreadsheets expect.
export function toCsv(rows: ActivityRow[]): string {
  const lines = [['when', 'what', 'who', 'detail'], ...rows.map((r) => [r.at, r.kind, r.who, r.detail])]
  return lines.map((l) => `${l.map(quote).join(',')}\r\n`).join('')
}

@Injectable()
export class ActivityService {
  constructor(private readonly ds: DataSource) {}

  async list(): Promise<ActivityRow[]> {
    const rows = await this.ds.getRepository(ActivityLog).find({ order: { createdAt: 'DESC', id: 'DESC' }, take: LIMIT })
    const users = await this.ds.getRepository(XUser).find()
    const handle = new Map(users.map((u) => [u.xUserId, u.handle]))
    return rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), kind: r.kind, who: handle.has(r.subject) ? `@${handle.get(r.subject)}` : r.subject, detail: r.detail }))
  }
}
