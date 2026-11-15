import { BadRequestException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ActivityLog } from '../activity/activity-log.entity'
import { Setting } from '../setting.entity'
import { DAILY_CAP_KEY, dailyCap, sentToday } from './daily-cap'

export const MAX_DAILY_CAP = 500

@Injectable()
export class SendSettingsService {
  constructor(private readonly ds: DataSource) {}

  async get(now: Date): Promise<{ dailyCap: number; sentToday: number }> {
    return { dailyCap: await dailyCap(this.ds.manager), sentToday: await sentToday(this.ds.manager, now) }
  }

  async setDailyCap(value: number): Promise<void> {
    if (!Number.isInteger(value) || value < 0 || value > MAX_DAILY_CAP) throw new BadRequestException(`The daily cap is a whole number from 0 to ${MAX_DAILY_CAP}`)
    await this.ds.transaction(async (em) => {
      const before = await dailyCap(em)
      if (before === value) return
      await em.save(Setting, { key: DAILY_CAP_KEY, value })
      await em.save(ActivityLog, { kind: 'cap_changed', subject: 'Daily cap', detail: `Daily send cap changed from ${before} to ${value}` })
    })
  }
}
