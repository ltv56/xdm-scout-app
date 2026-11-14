import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Campaign, Prospect } from '../discovery/entities'
import { Contact, DoNotContact, SenderAccount, XUser } from '../sending/entities'
import { X_CLIENT, XClient } from '../x/x-client'

const READ_MAX = 100
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The keyword counts as a whole word, any case: "build" matches "Build, I'm..." but not "rebuild".
export const hasKeyword = (text: string, keyword: string) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(keyword)}($|[^\\p{L}\\p{N}_])`, 'iu').test(text)

// Reads the sender's DMs and attaches the ones that answer the call post. Nothing is drafted or sent here.
@Injectable()
export class InboundLaneService {
  constructor(
    private readonly ds: DataSource,
    @Inject(X_CLIENT) private readonly x: XClient,
  ) {}

  async attach(campaignId: number): Promise<{ attached: number }> {
    const campaign = await this.ds.getRepository(Campaign).findOneBy({ id: campaignId })
    if (!campaign) throw new NotFoundException('Campaign not found')
    const sender = await this.ds.getRepository(SenderAccount).find({ take: 1 })
    if (!campaign.callKeyword || !campaign.callPostedAt || !sender[0]) return { attached: 0 }
    const { callKeyword, callPostedAt } = campaign

    const dms = (await this.x.getInboundDms(READ_MAX)).filter((d) => d.createdAt >= callPostedAt && hasKeyword(d.text, callKeyword))
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
    return { attached }
  }
}
