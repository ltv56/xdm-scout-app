import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, IsNull, Not } from 'typeorm'
import { ApiUsage, Campaign, Prospect } from '../discovery/entities'
import { PRICES } from '../discovery/pricing'
import { Job } from '../jobs/job.entity'
import { JobsService } from '../jobs/jobs.service'
import { Contact, DoNotContact, SenderAccount, XUser } from '../sending/entities'
import { X_CLIENT, XClient } from '../x/x-client'

// X bills each DM event read, so a check reads few; a 30-minute schedule catches the rest.
const READ_MAX = 10
const CHECK_EVERY_MS = 30 * 60_000
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The keyword counts as a whole word, any case: "build" matches "Build, I'm..." but not "rebuild".
export const hasKeyword = (text: string, keyword: string) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(keyword)}($|[^\\p{L}\\p{N}_])`, 'iu').test(text)

// Reads the sender's DMs and attaches the ones that answer the call post. Nothing is drafted or sent here.
@Injectable()
export class InboundLaneService {
  constructor(
    private readonly ds: DataSource,
    @Inject(X_CLIENT) private readonly x: XClient,
    private readonly jobs: JobsService,
  ) {}

  async attach(campaignId: number): Promise<{ attached: number; read: number }> {
    const campaign = await this.ds.getRepository(Campaign).findOneBy({ id: campaignId })
    if (!campaign) throw new NotFoundException('Campaign not found')
    const sender = await this.ds.getRepository(SenderAccount).find({ take: 1 })
    if (!campaign.callKeyword || !campaign.callPostedAt || !sender[0]) return { attached: 0, read: 0 }
    const { callKeyword, callPostedAt } = campaign

    const read = await this.x.getInboundDms(READ_MAX)
    if (read.length) await this.ds.getRepository(ApiUsage).save({ campaignId, kind: 'dm_event', count: read.length, costMicros: read.length * PRICES.dm_event })
    const dms = read.filter((d) => d.createdAt >= callPostedAt && hasKeyword(d.text, callKeyword))
    const stopped = new Set((await this.ds.getRepository(DoNotContact).find()).map((d) => d.xUserId))
    // Newest first, so the first DM seen for a person is their latest answer.
    const latest = new Map<string, (typeof dms)[number]>()
    for (const d of dms) if (!stopped.has(d.senderId) && !latest.has(d.senderId)) latest.set(d.senderId, d)

    let attached = 0
    for (const dm of latest.values()) {
      const done = await this.ds.transaction(async (em) => {
        const existing = await em.findOneBy(Prospect, { campaignId, xUserId: dm.senderId })
        if (existing?.callEventId === dm.eventId) return false
        if (dm.handle && !(await em.existsBy(XUser, { xUserId: dm.senderId }))) await em.save(XUser, { xUserId: dm.senderId, handle: dm.handle })
        const call = { relationship: 'messaged_us' as const, callEventId: dm.eventId, callText: dm.text.slice(0, 512), callAt: dm.createdAt }
        if (existing) await em.update(Prospect, existing.id, call)
        else await em.save(Prospect, { campaignId, xUserId: dm.senderId, source: 'call', ...call })
        if (!(await em.existsBy(Contact, { senderAccountId: sender[0].id, xUserId: dm.senderId }))) {
          await em.save(Contact, { senderAccountId: sender[0].id, xUserId: dm.senderId, relationshipContext: 'messaged_us' })
        }
        return true
      })
      if (done) attached += 1
    }
    return { attached, read: read.length }
  }

  // Queues one check per campaign with a call post once its last one is 30 minutes old; the worker runs them.
  async scheduleChecks(now: Date): Promise<void> {
    if (!(await this.ds.getRepository(SenderAccount).count())) return
    const campaigns = await this.ds.getRepository(Campaign).findBy({ callKeyword: Not(IsNull()), callPostedAt: Not(IsNull()) })
    for (const c of campaigns) {
      if (await this.jobs.hasOpen('inbound_check', 'campaignId', c.id)) continue
      const last = await this.ds
        .getRepository(Job)
        .createQueryBuilder('j')
        .select('MAX(j.runAt)', 'at')
        .where("j.type = 'inbound_check' AND JSON_EXTRACT(j.payload, '$.campaignId') = :id", { id: c.id })
        .getRawOne<{ at: Date | null }>()
      if (last?.at && now.getTime() - new Date(last.at).getTime() < CHECK_EVERY_MS) continue
      await this.jobs.enqueue('inbound_check', { campaignId: c.id }, now)
    }
  }

  // Fills the permission from the stored call DM. Nothing is sent: the draft still needs a person's approval.
  async confirmInvitation(campaignId: number, prospectId: number): Promise<void> {
    const prospect = await this.ds.getRepository(Prospect).findOneBy({ id: prospectId, campaignId })
    if (!prospect) throw new NotFoundException('Prospect not found')
    if (prospect.source !== 'call' || !prospect.callEventId || !prospect.callAt) throw new ConflictException('This person did not answer the call post')
    if (await this.ds.getRepository(DoNotContact).existsBy({ xUserId: prospect.xUserId })) throw new ConflictException('This person is on Do not contact')
    const { affected } = await this.ds.getRepository(Contact).update(
      { xUserId: prospect.xUserId },
      { recipientPermission: 'requested_dm', invitationEventId: prospect.callEventId, invitationAt: prospect.callAt },
    )
    if (!affected) throw new ConflictException('No contact for this person yet: run Check now first')
  }
}
