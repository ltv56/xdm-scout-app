import { DataSource, In } from 'typeorm'
import { ApiUsage } from '../discovery/entities'
import { PRICES } from '../discovery/pricing'
import { StoredSentence } from '../review/checks'
import { XClient } from '../x/x-client'
import { Evidence } from './entities'

export const DELETED_POST_REASON = 'A post this message quotes was deleted on X. Fix or skip the draft.'

// Only posts can be deleted; a bio row is a snapshot and is not asked about.
export const citedPostIds = (sentences: StoredSentence[] | null): string[] => [
  ...new Set((sentences ?? []).flatMap((s) => (s.source?.type === 'evidence' && s.source.evidenceId.startsWith('post:') ? [s.source.evidenceId] : []))),
]

// Asks X about the evidence rows not yet known to be deleted, marks the missing ones, and returns every id among them that is deleted.
export async function recheckEvidence(ds: DataSource, x: XClient, ids: string[], now: Date, campaignId: number | null): Promise<string[]> {
  if (!ids.length) return []
  const rows = await ds.getRepository(Evidence).findBy({ id: In(ids) })
  const known = rows.filter((e) => e.deletedAt).map((e) => e.id)
  const open = rows.filter((e) => !e.deletedAt)
  if (!open.length) return known
  const served = await x.getPostsExist(open.map((e) => e.id.slice('post:'.length)))
  if (campaignId !== null) await ds.getRepository(ApiUsage).save({ campaignId, kind: 'post', count: open.length, costMicros: open.length * PRICES.post })
  const missing = open.filter((e) => !served.has(e.id.slice('post:'.length))).map((e) => e.id)
  if (missing.length) await ds.getRepository(Evidence).update({ id: In(missing) }, { deletedAt: now, excerpt: '' })
  return [...known, ...missing]
}
