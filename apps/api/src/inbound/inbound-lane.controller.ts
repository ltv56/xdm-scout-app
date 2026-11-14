import { Controller, ParseIntPipe, Param, Post } from '@nestjs/common'
import { InboundLaneService } from './inbound-lane.service'

@Controller('campaigns')
export class InboundLaneController {
  constructor(private readonly lane: InboundLaneService) {}

  // "Check now": read the DMs once and attach the ones that answer the call post.
  @Post(':id/inbound/check')
  check(@Param('id', ParseIntPipe) id: number) {
    return this.lane.attach(id)
  }
}
