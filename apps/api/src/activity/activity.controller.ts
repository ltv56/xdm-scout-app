import { Controller, Get, Header } from '@nestjs/common'
import { ActivityService, toCsv } from './activity.service'

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list() {
    return this.activity.list()
  }

  @Get('csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="activity.csv"')
  async csv() {
    return toCsv(await this.activity.list())
  }
}
