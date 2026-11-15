import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Campaign } from '../discovery/entities'
import { FunnelService } from './funnel.service'

@Controller('funnel')
export class FunnelController {
  constructor(
    private readonly ds: DataSource,
    private readonly funnel: FunnelService,
  ) {}

  @Get()
  async get(@Query('campaignId') raw: string) {
    const id = Number(raw)
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException('campaignId must be a positive integer')
    if (!(await this.ds.getRepository(Campaign).findOneBy({ id }))) throw new NotFoundException('Campaign not found')
    return this.funnel.get(id)
  }
}
