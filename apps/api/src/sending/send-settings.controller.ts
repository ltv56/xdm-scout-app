import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common'
import { z } from 'zod'
import { SendSettingsService } from './send-settings.service'

const body = z.object({ dailyCap: z.number() }).strict()

@Controller('send-settings')
export class SendSettingsController {
  constructor(private readonly settings: SendSettingsService) {}

  @Get()
  get() {
    return this.settings.get(new Date())
  }

  @Put()
  async put(@Body() raw: unknown) {
    const parsed = body.safeParse(raw)
    if (!parsed.success) throw new BadRequestException('dailyCap must be a number')
    await this.settings.setDailyCap(parsed.data.dailyCap)
    return this.settings.get(new Date())
  }
}
