import { BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Optional, Param, ParseIntPipe, Patch, Post } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { JobsService } from '../jobs/jobs.service'
import { queueScores } from './queue-scores'
import { resolveLane } from './campaign-lane'
import { MAX_FOLLOWERS_MAX, MAX_FOLLOWING_PER_SEED, MAX_SEARCH_RESULTS, MIN_FOLLOWERS_MAX, MIN_FOLLOWING_PER_SEED, MIN_SEARCH_RESULTS } from './pricing'
import { DiscoveryService, uniqueHandles } from './discovery.service'
import { Campaign, Prospect } from './entities'
import { FEATURES } from '../features'
import type { Features } from '../feature-flags'
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
  searchMax: z.number().int().min(MIN_SEARCH_RESULTS).max(MAX_SEARCH_RESULTS),
  followingMax: z.number().int().min(MIN_FOLLOWING_PER_SEED).max(MAX_FOLLOWING_PER_SEED),
  followersMax: z.number().int().min(MIN_FOLLOWERS_MAX).max(MAX_FOLLOWERS_MAX),
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
    searchMax: fields.searchMax.optional(),
    followingMax: fields.followingMax.optional(),
    followersMax: fields.followersMax.optional(),
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
    @Optional() @Inject(FEATURES) private readonly features: Features = { callPost: true },
  ) {}

  // Clearing a call post (null) is always fine; setting one only where the lane is on.
  private refuseCallPost(callPostUrl: string | null | undefined, callKeyword: string | null | undefined) {
    if (!this.features.callPost && (callPostUrl || callKeyword)) throw new BadRequestException('Call posts are turned off on this server.')
  }

  @Get()
  listCampaigns() {
    return this.ds.getRepository(Campaign).find({ select: { id: true, name: true }, order: { id: 'DESC' } })
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createBody.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '))
    const { budgetUsd, programId, callPostUrl, callKeyword, ...rest } = parsed.data
    this.refuseCallPost(callPostUrl, callKeyword)
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
    this.refuseCallPost(callPostUrl, callKeyword)
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
  // prospectIds: score these people again instead, for example after their posts were read. A model call each, so only on request.
  @Post(':id/score')
  async score(@Param('id', ParseIntPipe) id: number, @Body() body: unknown = {}) {
    const parsed = z.object({ prospectIds: z.array(z.number().int()).max(1000).optional() }).strict().safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException('Send prospectIds as a list of numbers, or nothing.')
    return { queued: await queueScores(this.ds, this.jobs, id, parsed.data.prospectIds) }
  }

  @Post(':id/prospects/:pid/score')
  // again: score a scored person anew, for example after their posts were read. It costs a model call, so only on request.
  async scoreOne(@Param('id', ParseIntPipe) id: number, @Param('pid', ParseIntPipe) pid: number, @Body() body: { again?: boolean } = {}) {
    const prospect = await this.ds.getRepository(Prospect).findOneBy({ id: pid, campaignId: id })
    if (!prospect) throw new NotFoundException('Candidate not found')
    if (prospect.scoredAt && body?.again !== true) return { queued: false, reason: 'Already scored' }
    if (await this.jobs.hasOpen('score', 'prospectId', pid)) return { queued: false, reason: 'Already being scored' }
    await this.jobs.enqueue('score', { prospectId: pid }, new Date())
    return { queued: true }
  }

  @Get(':id/prospects')
  list(@Param('id', ParseIntPipe) id: number) {
    return this.prospects.list(id)
  }

  // Reads one person's recent posts now. Past the budget it needs raiseBudget, which the screen asks for with the cost shown.
  @Post(':id/prospects/:pid/read-posts')
  @HttpCode(200)
  readPosts(@Param('id', ParseIntPipe) id: number, @Param('pid', ParseIntPipe) pid: number, @Body() body: unknown) {
    const parsed = z.object({ raiseBudget: z.boolean().default(false) }).strict().safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException('Send raiseBudget true or false.')
    return this.discovery.readPostsFor(id, pid, parsed.data)
  }

  // Reads the posts of everyone the search left unread. Past the budget it needs raiseBudget, like one person.
  @Post(':id/read-posts')
  @HttpCode(200)
  readPendingPosts(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const parsed = z.object({ raiseBudget: z.boolean().default(false) }).strict().safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException('Send raiseBudget true or false.')
    return this.discovery.readPendingPosts(id, parsed.data)
  }

  @Get(':id/prospects/:pid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('pid', ParseIntPipe) pid: number) {
    return this.prospects.detail(id, pid)
  }

  private async campaign(id: number) {
    const campaign = await this.ds.getRepository(Campaign).findOneBy({ id })
    if (!campaign) throw new NotFoundException('Campaign not found')
    return campaign
  }
}
