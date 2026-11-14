import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import { z } from 'zod'
import { KnownListService } from './known-list.service'

const importBody = z.object({ listName: z.string(), handles: z.string() })

@Controller('known-users')
export class KnownListController {
  constructor(private readonly known: KnownListService) {}

  @Get()
  list() {
    return this.known.list()
  }

  @Post('import')
  @HttpCode(200)
  import(@Body() body: unknown) {
    const r = importBody.safeParse(body)
    if (!r.success) throw new BadRequestException('listName and handles are required')
    return this.known.import(r.data.listName, r.data.handles)
  }

  @Delete(':xUserId')
  async remove(@Param('xUserId') xUserId: string) {
    await this.known.remove(xUserId)
    return { ok: true }
  }
}
