import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common'
import { DataSource, IsNull } from 'typeorm'
import { z } from 'zod'
import { JobsService } from '../jobs/jobs.service'
import { resolveLane } from './campaign-lane'
import { DiscoveryService, uniqueHandles } from './discovery.service'
import { Campaign, Prospect } from './entities'
import { ProspectsService } from './prospects.service'

const NO_SOURCE = 'Give at least one handle, seed account or search query'

const fields = {
  name: z.string().min(1).max(128),
  keywords: z.array(z.string().min(1)).min(1),
  handles: z.array(z.string().min(1)),
  seeds: z.array(z.string().min(1)).max(10),
  queries: z.array(z.string().min(1).max(512)).max(10),
  criteria: z.array(z.string().min(1).max(200)).max(5),
  budgetUsd: z.number().positive().max(100),
  programId: z.number().int().positive().nullable(),
  callPostUrl: z.string().nullable(),
  callKeyword: z.string().nullable(),
}

const createBody = z
  .object({
    ...fields,
    handles: fields.handles.default([]),
    seeds: fields.seeds.default([]),
    queries: fields.queries.default([]),
    criteria: fields.criteria.default([]),
    budgetUsd: fields.budgetUsd.optional(),
    programId: fields.programId.optional(),
    callPostUrl: fields.callPostUrl.optional(),
    callKeyword: fields.callKeyword.optional(),
  })
  .strict()
  .refine((b) => b.handles.length + b.seeds.length + b.queries.length > 0, { message: NO_SOURCE })

// Every field is optional; what is not sent stays as it is.
const updateBody = z.object(fields).partial().strict()

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly ds: DataSource,
    private readonly jobs: JobsService,
    private readonly discovery: DiscoveryService,
    private readonly prospects: ProspectsService,
  ) {}

  @Get()
  listCampaigns() {
    return this.ds.getRepository(Campaign).find({ select: { id: true, name: true }, order: { id: 'DESC' } })
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createBody.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '))
    const { budgetUsd, programId, callPostUrl, callKeyword, ...rest } = parsed.data
    const lane = await resolveLane(this.ds, { programId, callPostUrl, callKeyword })
    return this.ds.getRepository(Campaign).save({
      ...rest,
      handles: uniqueHandles(rest.handles),
      seeds: uniqueHandles(rest.seeds),
      ...lane,
      ...(budgetUsd && { budgetMicros: Math.round(budgetUsd * 1_000_000) }),
    })
  }

  // Only the campaign row changes: the people found, drafts and sends stay as they are.
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const current = await this.campaign(id)
    const parsed = updateBody.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '))
    const { budgetUsd, programId, callPostUrl, callKeyword, handles, seeds, ...rest } = parsed.data
    const patch: Partial<Campaign> = { ...rest }
    if (handles) patch.handles = uniqueHandles(handles)
    if (seeds) patch.seeds = uniqueHandles(seeds)
    const sources = (patch.handles ?? current.handles).length + (patch.seeds ?? current.seeds ?? []).length + (patch.queries ?? current.queries ?? []).length
    if (sources === 0) throw new BadRequestException(NO_SOURCE)
    if (budgetUsd !== undefined) patch.budgetMicros = Math.round(budgetUsd * 1_000_000)
    // resolveLane clears what it is not given, so a lane change starts from the stored values.
    if (programId !== undefined || callPostUrl !== undefined || callKeyword !== undefined) {
      Object.assign(
        patch,
        await resolveLane(this.ds, {
          programId: programId !== undefined ? programId : current.programId,
          callPostUrl: callPostUrl !== undefined ? callPostUrl : current.callPostUrl,
          callKeyword: callKeyword !== undefined ? callKeyword : current.callKeyword,
        }),
      )
    }
    if (Object.keys(patch).length) await this.ds.getRepository(Campaign).update(id, patch)
    return this.campaign(id)
  }

  // searching: a discovery is waiting for the worker or running, so a screen can say so even after a reload.
  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaign(id)
    return { ...campaign, searching: await this.jobs.hasOpen('discover', 'campaignId', id) }
  }

  @Get(':id/estimate')
  async estimate(@Param('id', ParseIntPipe) id: number) {
    await this.campaign(id)
    return { ...(await this.discovery.estimate(id)), note: 'estimate at the prices in discovery/pricing.ts' }
  }

  @Post(':id/discover')
  async discover(@Param('id', ParseIntPipe) id: number) {
    await this.campaign(id)
    if (await this.jobs.hasOpen('discover', 'campaignId', id)) {
      return { queued: false, reason: 'Discovery is already running for this campaign' }
    }
    await this.jobs.enqueue('discover', { campaignId: id }, new Date())
    return { queued: true }
  }

  // Score all: everyone not scored yet and not already waiting for the worker.
  @Post(':id/score')
  async score(@Param('id', ParseIntPipe) id: number) {
    const pending = await this.ds.getRepository(Prospect).findBy({ campaignId: id, scoredAt: IsNull() })
    let queued = 0
    for (const p of pending) {
      if (await this.jobs.hasOpen('score', 'prospectId', p.id)) continue
      await this.jobs.enqueue('score', { prospectId: p.id }, new Date())
      queued += 1
    }
    return { queued }
  }

  @Post(':id/prospects/:pid/score')
  async scoreOne(@Param('id', ParseIntPipe) id: number, @Param('pid', ParseIntPipe) pid: number) {
    const prospect = await this.ds.getRepository(Prospect).findOneBy({ id: pid, campaignId: id })
    if (!prospect) throw new NotFoundException('Candidate not found')
    if (prospect.scoredAt) return { queued: false, reason: 'Already scored' }
    if (await this.jobs.hasOpen('score', 'prospectId', pid)) return { queued: false, reason: 'Already being scored' }
    await this.jobs.enqueue('score', { prospectId: pid }, new Date())
    return { queued: true }
  }

  @Get(':id/prospects')
  list(@Param('id', ParseIntPipe) id: number) {
    return this.prospects.list(id)
  }

  private async campaign(id: number) {
    const campaign = await this.ds.getRepository(Campaign).findOneBy({ id })
    if (!campaign) throw new NotFoundException('Campaign not found')
    return campaign
  }
}
