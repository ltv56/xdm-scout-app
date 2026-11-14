import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Campaign } from '../discovery/entities'
import { AttentionService } from './attention.service'

@Controller('needs-attention')
export class AttentionController {
  constructor(
    private readonly ds: DataSource,
    private readonly attention: AttentionService,
  ) {}

  @Get()
  async list(@Query('campaignId') raw: string) {
    const id = Number(raw)
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException('campaignId must be a positive integer')
    if (!(await this.ds.getRepository(Campaign).findOneBy({ id }))) throw new NotFoundException('Campaign not found')
    return this.attention.list(id, new Date())
  }
}
