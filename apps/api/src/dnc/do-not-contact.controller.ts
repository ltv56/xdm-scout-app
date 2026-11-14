import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { z } from 'zod'
import { DoNotContactService } from './do-not-contact.service'

const removeBody = z.object({ reason: z.string() })

@Controller('do-not-contact')
export class DoNotContactController {
  constructor(private readonly dnc: DoNotContactService) {}

  @Get()
  list() {
    return this.dnc.list()
  }

  @Post(':xUserId/remove')
  @HttpCode(200)
  async remove(@Param('xUserId') xUserId: string, @Body() body: unknown) {
    const r = removeBody.safeParse(body)
    if (!r.success) throw new BadRequestException('reason is required')
    await this.dnc.remove(xUserId, r.data.reason)
    return { ok: true }
  }
}
