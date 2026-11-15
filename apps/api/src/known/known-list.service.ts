import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { X_CLIENT, XClient } from '../x/x-client'
import type { ImportResult, KnownKind, KnownPerson } from './contract'
import { ActivityLog } from '../activity/activity-log.entity'
import { KnownUser } from './known-user.entity'
import { applyWarmOpening } from './warm-opening'

const MAX_HANDLES = 500
const LOOKUP_BATCH = 100

// One handle per line, or the first column of a CSV; a header such as "handle" is skipped.
export function splitHandles(text: string): { valid: string[]; invalid: string[] } {
  const tokens = text
    .split(/\r?\n/)
    .map((line) => line.split(',')[0].trim().replace(/^@/, '').toLowerCase())
    .filter((t) => t && t !== 'handle')
  const unique = [...new Set(tokens)]
  const ok = (t: string) => /^[a-z0-9_]{1,15}$/.test(t)
  return { valid: unique.filter(ok), invalid: unique.filter((t) => !ok(t)) }
}

export const parseHandles = (text: string) => splitHandles(text).valid

@Injectable()
export class KnownListService {
  constructor(
    private readonly ds: DataSource,
    @Inject(X_CLIENT) private readonly x: XClient,
  ) {}

  async list(): Promise<KnownPerson[]> {
    const rows = await this.ds.getRepository(KnownUser).find({ order: { createdAt: 'ASC', xUserId: 'ASC' } })
    return rows.map((r) => ({ xUserId: r.xUserId, handle: r.handle, listName: r.listName, kind: r.kind, event: r.event, since: r.createdAt.toISOString() }))
  }

  // X bills each profile it returns, so the handles are looked up in batches and only once per import.
  async import(listName: string, text: string, opts: { kind?: KnownKind; event?: string } = {}): Promise<ImportResult> {
    const kind = opts.kind ?? 'known'
    const event = kind === 'warm' ? opts.event?.trim() || null : null
    const name = listName.trim()
    if (!name) throw new BadRequestException('Give the list a name')
    const { valid: handles, invalid } = splitHandles(text)
    if (!handles.length) throw new BadRequestException('No handles found')
    if (handles.length > MAX_HANDLES) throw new BadRequestException(`At most ${MAX_HANDLES} handles at a time`)

    const found = []
    for (let i = 0; i < handles.length; i += LOOKUP_BATCH) found.push(...(await this.x.lookupUsers(handles.slice(i, i + LOOKUP_BATCH))))
    const repo = this.ds.getRepository(KnownUser)
    const existing = new Set((await repo.findBy({ xUserId: In(found.map((p) => p.id)) })).map((k) => k.xUserId))
    const fresh = found.filter((p) => !existing.has(p.id))
    await repo.save(fresh.map((p) => ({ xUserId: p.id, handle: p.handle, listName: name, kind, event })))
    if (kind === 'warm') await applyWarmOpening(this.ds, fresh.map((p) => p.id), new Date())
    if (fresh.length) await this.ds.getRepository(ActivityLog).save({ kind: 'known_added', subject: name.slice(0, 64), detail: `Added ${fresh.length} ${fresh.length === 1 ? 'person' : 'people'}${event ? ` (${event})` : ''}`.slice(0, 500) })
    const seen = new Set(found.map((p) => p.handle.toLowerCase()))
    return { added: fresh.length, alreadyKnown: found.length - fresh.length, notFound: handles.filter((h) => !seen.has(h)), invalid }
  }

  async remove(xUserId: string): Promise<void> {
    const person = await this.ds.getRepository(KnownUser).findOneBy({ xUserId })
    if (!person) throw new NotFoundException('This person is not on the list')
    await this.ds.transaction(async (em) => {
      await em.delete(KnownUser, { xUserId })
      await em.save(ActivityLog, { kind: 'known_removed', subject: xUserId, detail: `Removed ${person.handle} from ${person.listName}`.slice(0, 500) })
    })
  }
}
