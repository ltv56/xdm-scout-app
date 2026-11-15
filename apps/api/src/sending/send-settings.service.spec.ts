import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ActivityLog } from '../activity/activity-log.entity'
import { createTestDataSource } from '../test/db'
import { dailyCap } from './daily-cap'
import { SendSettingsService } from './send-settings.service'

let ds: DataSource
let service: SendSettingsService

beforeEach(async () => {
  ds = await createTestDataSource()
  service = new SendSettingsService(ds)
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('SendSettingsService', () => {
  it('shows the default cap and what was used today', async () => {
    expect(await service.get(new Date())).toEqual({ dailyCap: 25, sentToday: 0 })
  })

  it('changes the cap, which the sending path reads, and logs the change', async () => {
    await service.setDailyCap(40)
    expect(await dailyCap(ds.manager)).toBe(40)
    expect((await service.get(new Date())).dailyCap).toBe(40)
    expect((await ds.getRepository(ActivityLog).find()).map((r) => [r.kind, r.detail])).toEqual([['cap_changed', 'Daily send cap changed from 25 to 40']])
  })

  it('accepts 0 and 500, and logs the old value of the second change', async () => {
    await service.setDailyCap(0)
    await service.setDailyCap(500)
    expect(await dailyCap(ds.manager)).toBe(500)
    expect((await ds.getRepository(ActivityLog).find({ order: { id: 'ASC' } })).map((r) => r.detail)).toEqual(['Daily send cap changed from 25 to 0', 'Daily send cap changed from 0 to 500'])
  })

  it('logs nothing when the value does not change', async () => {
    await service.setDailyCap(25)
    expect(await ds.getRepository(ActivityLog).count()).toBe(0)
  })

  it.each([-1, 501, 2.5, Number.NaN])('rejects %s', async (n) => {
    await expect(service.setDailyCap(n)).rejects.toThrow('whole number from 0 to 500')
    expect(await ds.getRepository(ActivityLog).count()).toBe(0)
  })
})
