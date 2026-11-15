import { Controller, ParseIntPipe, Param, Post } from '@nestjs/common'
import { PRICES } from '../discovery/pricing'
import { InboundLaneService } from './inbound-lane.service'

@Controller('campaigns')
export class InboundLaneController {
  constructor(private readonly lane: InboundLaneService) {}

  // "Check now": read the DMs once and attach the ones that answer the call post.
  @Post(':id/inbound/check')
  async check(@Param('id', ParseIntPipe) id: number) {
    const { attached, read } = await this.lane.attach(id)
    return { attached, read, costMicros: read * PRICES.dm_event }
  }

  // "Confirm invitation": the person's call DM counts as their request for a DM. Sends nothing.
  @Post(':id/prospects/:prospectId/invitation')
  async confirm(@Param('id', ParseIntPipe) id: number, @Param('prospectId', ParseIntPipe) prospectId: number) {
    await this.lane.confirmInvitation(id, prospectId)
    return { confirmed: true }
  }
}
