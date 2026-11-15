import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addDoNotContact } from '../dnc/add-do-not-contact'
import { createTestDataSource } from '../test/db'
import { XUser } from '../sending/entities'
import { ActivityLog } from './activity-log.entity'
import { ActivityService, toCsv } from './activity.service'

let ds: DataSource
let service: ActivityService

beforeEach(async () => {
  ds = await createTestDataSource()
  service = new ActivityService(ds)
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

const log = (kind: ActivityLog['kind'], subject: string, detail: string, createdAt: Date) => ds.getRepository(ActivityLog).save({ kind, subject, detail, createdAt })

describe('ActivityService', () => {
  it('lists entries newest first and names the person when it knows them', async () => {
    await ds.getRepository(XUser).save({ xUserId: '201', handle: 'mina_builds' })
    await log('dnc_removed', '201', 'Asked to be contacted again', new Date('2026-11-14T10:00:00Z'))
    await log('known_added', 'Portfolio', 'Added 3 people', new Date('2026-11-15T10:00:00Z'))
    const rows = await service.list()
    expect(rows.map((r) => [r.kind, r.who, r.detail])).toEqual([
      ['known_added', 'Portfolio', 'Added 3 people'],
      ['dnc_removed', '@mina_builds', 'Asked to be contacted again'],
    ])
  })

  it('writes a CSV with quoted commas, quotes and line breaks', async () => {
    await log('dnc_removed', '201', 'He said, "talk later"\nthanks', new Date('2026-11-14T10:00:00.000Z'))
    expect(toCsv(await service.list())).toBe('when,what,who,detail\r\n2026-11-14T10:00:00.000Z,dnc_removed,201,"He said, ""talk later""\nthanks"\r\n')
  })

  it('logs a Do not contact addition once, however often it is asked', async () => {
    await ds.transaction((em) => addDoNotContact(em, { xUserId: '201', reason: 'Replied: Opt-out', source: 'reply' }))
    await ds.transaction((em) => addDoNotContact(em, { xUserId: '201', reason: 'Reply marked Opt-out', source: 'operator' }))
    expect(await ds.getRepository(ActivityLog).find()).toEqual([expect.objectContaining({ kind: 'dnc_added', subject: '201', detail: 'Replied: Opt-out' })])
  })
})
