import { Controller, Get, Query } from '@nestjs/common'
import { PreflightService } from './preflight.service'

@Controller('preflight')
export class PreflightController {
  constructor(private readonly preflight: PreflightService) {}

  @Get()
  run() {
    return this.preflight.run()
  }
}

@Controller('health/details')
export class HealthDetailsController {
  constructor(private readonly preflight: PreflightService) {}

  @Get()
  details() {
    return this.preflight.details(new Date())
  }
}

@Controller('top-bar')
export class TopBarController {
  constructor(private readonly preflight: PreflightService) {}

  @Get()
  topBar(@Query('campaignId') campaignId?: string) {
    const id = Number(campaignId)
    return this.preflight.topBar(Number.isInteger(id) && id > 0 ? id : null, new Date())
  }
}
