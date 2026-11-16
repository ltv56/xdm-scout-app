import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import { z } from 'zod'
import { HandleExtractor } from './handle-extract'
import { KnownListService } from './known-list.service'

const fileBody = z.object({ text: z.string() })
const importBody = z.object({ listName: z.string(), handles: z.string(), kind: z.enum(['known', 'warm']).optional(), event: z.string().max(255).optional() })

@Controller('known-users')
export class KnownListController {
  constructor(
    private readonly known: KnownListService,
    private readonly extractor: HandleExtractor,
  ) {}

  @Get()
  list() {
    return this.known.list()
  }

  @Post('import')
  @HttpCode(200)
  import(@Body() body: unknown) {
    const r = importBody.safeParse(body)
    if (!r.success) throw new BadRequestException('listName and handles are required')
    return this.known.import(r.data.listName, r.data.handles, { kind: r.data.kind, event: r.data.event })
  }

  // What reading a file with the model would cost, shown before the person agrees to it.
  @Post('extract/estimate')
  @HttpCode(200)
  estimate(@Body() body: unknown) {
    return this.extractor.estimate(fileText(body))
  }

  @Post('extract')
  @HttpCode(200)
  async extract(@Body() body: unknown) {
    return this.extractor.extract(fileText(body))
  }

  @Delete(':xUserId')
  async remove(@Param('xUserId') xUserId: string) {
    await this.known.remove(xUserId)
    return { ok: true }
  }
}

function fileText(body: unknown) {
  const r = fileBody.safeParse(body)
  if (!r.success) throw new BadRequestException('text is required')
  return r.data.text
}
