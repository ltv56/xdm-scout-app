import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewQueue, SkipReason } from '../../api/src/review/contract'
import { getJson, postJson } from './api'
import EmptyState from './EmptyState'
import FitBadge from './FitBadge'
import { More } from './icons'
import CandidateActions from './CandidateActions'
import Select from './Select'
import Spinner from './Spinner'
import XLink from './XLink'
import { deliveryNote, LANDS_IN_HINT, LANDS_IN_LABEL, RELATIONSHIP_LABEL, SKIP_LABEL, SKIP_REASONS } from './review/labels'
import { btnLink, btnOutline, btnSecondary, chip, tone } from './ui'

interface Claim {
  side: 'for' | 'against' | 'unknown'
  text: string
  status: 'verified' | 'inferred'
  evidence: { id: string; url: string }[]
}

export interface Prospect {
  id: number
  handle: string
  name: string
  bio: string
  followers: number
  seedCount: number
  lastPostAt: string | null
  criteria: { text: string; status: 'met' | 'not_met' | 'unknown'; evidenceIds: string[] }[]
  fit: 'strong' | 'possible' | 'weak' | 'not_a_fit' | null
  relationship: 'messaged_us' | 'follower' | 'engaged' | 'adjacent' | 'cold'
  status: 'new' | 'shortlisted' | 'dismissed'
  scoring: boolean
  // Where this person's send stands in the Outbox ("Send in X", "Sent"...), or null when nothing was sent.
  outbox: string | null
  role: string | null
  areas: string[]
  identityWarning: boolean
  landsIn: 'inbox' | 'requests' | 'cant_receive' | null
  call: { text: string; at: string; invitationConfirmed: boolean } | null
  fundList: { name: string; kind: 'known' | 'warm'; event: string | null } | null
  opening: { type: string; summary: string | null; freshness: 'fresh' | 'stale' | 'expired'; url: string | null; date: string } | null
  claims: Claim[]
}

const CRITERION_LABEL = { met: 'met', not_met: 'not met', unknown: 'unknown' }
const CRITERION_STYLE = {
  met: 'bg-ok-bg text-ok font-semibold',
  not_met: 'bg-block-bg text-block',
  unknown: 'bg-rail text-muted',
}

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'today' : `${days}d ago`
}

// "Draft a message": one person, on request. It writes the draft and puts it in Review. Anyone but Not a fit, and only with an opening.
function DraftControl({ p, campaignId, inReview, onReview }: { p: Prospect; campaignId: number; inReview: boolean; onReview: () => void }) {
  const qc = useQueryClient()
  const make = useMutation({
    mutationFn: () =>
      postJson(`/campaigns/${campaignId}/prospects/${p.id}/draft`),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['review-queue'] }), qc.invalidateQueries({ queryKey: ['ready'] })]),
  })
  const why = p.fit === null ? 'Not scored yet' : p.fit === 'not_a_fit' ? 'Not a fit' : !p.opening || p.opening.freshness === 'expired' ? 'No reason to reach out yet' : null

  if (p.outbox) return null
  if (inReview || make.isSuccess) {
    return (
      <button type="button" className={btnOutline} onClick={onReview}>
        Open in Review
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span title={why ?? undefined} className="inline-flex"><button type="button" className={btnSecondary} disabled={!!why || make.isPending} onClick={() => make.mutate()}>
        {make.isPending ? 'Writing…' : 'Draft a message'}
      </button></span>
      {why && <span className="text-sm text-muted">{why}</span>}
      {make.error && (
        <span role="alert" className="text-sm font-medium text-block">
          {make.error.message}
        </span>
      )}
    </div>
  )
}

// "Score": read this person's posts and decide how well they fit. The result comes from the worker, so the row shows Scoring… until it is in.
function ScoreControl({ p, campaignId }: { p: Prospect; campaignId: number }) {
  const qc = useQueryClient()
  const score = useMutation({
    mutationFn: () => postJson(`/campaigns/${campaignId}/prospects/${p.id}/score`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', campaignId] }),
  })
  const busy = p.scoring || score.isPending
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" className={btnSecondary} disabled={busy} onClick={() => score.mutate()}>
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Spinner className="size-3.5" />
            Scoring…
          </span>
        ) : (
          'Score'
        )}
      </button>
      {score.error && (
        <span role="alert" className="text-sm font-medium text-block">
          {score.error.message}
        </span>
      )}
    </div>
  )
}

// A call-post answer: their DM is the invitation, but only the operator's click makes it count for sending.
function InvitationControl({ p, campaignId }: { p: Prospect & { call: NonNullable<Prospect['call']> }; campaignId: number }) {
  const qc = useQueryClient()
  const confirm = useMutation({
    mutationFn: () => postJson(`/campaigns/${campaignId}/prospects/${p.id}/invitation`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', campaignId] }),
  })
  return (
    <div className="mt-3 text-sm">
      <p>
        <span className="font-semibold">Their answer to your call post:</span> <span className="wrap-anywhere">“{p.call.text}”</span>
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {p.call.invitationConfirmed ? (
          <span className="font-semibold text-ok">Invitation confirmed</span>
        ) : (
          <button type="button" className={btnSecondary} disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            Confirm invitation
          </button>
        )}
        {confirm.error && (
          <span role="alert" className="font-medium text-block">
            {confirm.error.message}
          </span>
        )}
      </p>
    </div>
  )
}

// "Dismiss": take one person off the candidate list with a reason. They stay in All, marked Dismissed, and are never drafted.
// It sits behind a menu button and asks first, because there is no undo.
function DismissControl({ p, campaignId }: { p: Prospect; campaignId: number }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<SkipReason>('not_fit')
  const box = useRef<HTMLDivElement>(null)
  const dismiss = useMutation({
    mutationFn: () => postJson(`/campaigns/${campaignId}/prospects/${p.id}/dismiss`, { reason }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['prospects', campaignId] }), qc.invalidateQueries({ queryKey: ['ready'] })]),
  })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`More actions for ${p.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-rail hover:text-ink"
      >
        <More className="size-5" />
      </button>
      {open && (
        <div role="dialog" aria-label={`Dismiss ${p.name}`} className="anim-pop absolute right-0 top-full z-10 mt-2 w-72 origin-top-right rounded-2xl border border-rule bg-raised p-4 shadow-soft">
          <p className="text-sm font-semibold">Dismiss {p.name}?</p>
          <p className="mt-1 text-xs text-muted">They stay in All, marked Dismissed, and are never drafted.</p>
          <label className="mt-3 block text-sm">
            <span className="text-muted">Reason</span>
            <Select value={reason} onChange={(e) => setReason(e.target.value as SkipReason)} wrapperClassName="mt-1 block w-full" className="py-1.5">
              {SKIP_REASONS.map((r) => (
                <option key={r} value={r}>
                  {SKIP_LABEL[r]}
                </option>
              ))}
            </Select>
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className={btnSecondary} disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
              {dismiss.isPending ? 'Dismissing…' : 'Dismiss'}
            </button>
            <button type="button" className={btnLink} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {dismiss.error && (
            <p role="alert" className="mt-2 text-sm font-medium text-block">
              {dismiss.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const metaLine = (p: Prospect) =>
  [
    [p.role !== 'other' ? p.role : null, ...p.areas.map((a) => a.replace('_', ' '))].filter(Boolean).join(' · '),
    p.seedCount > 0 ? `followed by ${p.seedCount} seed${p.seedCount > 1 ? 's' : ''}` : '',
    `${p.followers.toLocaleString()} followers`,
    p.lastPostAt ? `last post ${daysAgo(p.lastPostAt)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

type SortKey = 'default' | 'fit' | 'relationship' | 'followers' | 'seeds' | 'lastPost'
type Dir = 'asc' | 'desc'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'default', label: 'Best fit first' },
  { id: 'fit', label: 'Fit' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'followers', label: 'Followers' },
  { id: 'seeds', label: 'Seeds following' },
  { id: 'lastPost', label: 'Last post' },
]

const FIT_RANK = { strong: 4, possible: 3, weak: 2, not_a_fit: 1 }
const RELATIONSHIP_RANK = { messaged_us: 5, engaged: 4, follower: 3, adjacent: 2, cold: 1 }

// Sort value: bigger means "more". Missing values sort last in both directions.
function sortValue(p: Prospect, key: SortKey): number | null {
  if (key === 'fit') return p.fit ? FIT_RANK[p.fit] : null
  if (key === 'relationship') return RELATIONSHIP_RANK[p.relationship]
  if (key === 'followers') return p.followers
  if (key === 'seeds') return p.seedCount
  if (key === 'lastPost') return p.lastPostAt ? new Date(p.lastPostAt).getTime() : null
  return null
}

function sortProspects(list: Prospect[], key: SortKey, dir: Dir): Prospect[] {
  if (key === 'default') return list
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const x = sortValue(a, key)
    const y = sortValue(b, key)
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return (x - y) * sign
  })
}

type RelationshipFilter = Prospect['relationship'] | 'any'

const RELATIONSHIP_OPTIONS: { id: RelationshipFilter; label: string }[] = [
  { id: 'any', label: 'Any relationship' },
  { id: 'messaged_us', label: RELATIONSHIP_LABEL.messaged_us },
  { id: 'engaged', label: RELATIONSHIP_LABEL.engaged },
  { id: 'follower', label: RELATIONSHIP_LABEL.follower },
  { id: 'adjacent', label: 'Adjacent' },
  { id: 'cold', label: 'Cold' },
]

type LandsInFilter = NonNullable<Prospect['landsIn']> | 'unknown' | 'any'

const LANDS_IN_OPTIONS: { id: LandsInFilter; label: string }[] = [
  { id: 'any', label: 'All' },
  { id: 'inbox', label: LANDS_IN_LABEL.inbox },
  { id: 'requests', label: LANDS_IN_LABEL.requests },
  { id: 'cant_receive', label: LANDS_IN_LABEL.cant_receive },
  { id: 'unknown', label: 'Unknown' },
]

export type Filter = 'all' | 'ready' | 'drafted' | 'not_a_fit'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready for a draft' },
  { id: 'drafted', label: 'Drafted' },
  { id: 'not_a_fit', label: 'Not a fit' },
]

export default function Prospects({ campaignId, onReview, onOverview, initialFilter = 'all' }: { campaignId: number; onReview: () => void; onOverview: () => void; initialFilter?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [relationship, setRelationship] = useState<RelationshipFilter>('any')
  const [landsIn, setLandsIn] = useState<LandsInFilter>('any')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [dir, setDir] = useState<Dir>('desc')
  const { data, error, isLoading } = useQuery<Prospect[]>({
    queryKey: ['prospects', campaignId],
    queryFn: () => getJson(`/campaigns/${campaignId}/prospects`),
    refetchInterval: (q) => (q.state.data?.some((p) => p.scoring) ? 4_000 : false),
    refetchIntervalInBackground: true,
  })
  const queue = useQuery<ReviewQueue>({ queryKey: ['review-queue', campaignId], queryFn: () => getJson(`/review-queue?campaignId=${campaignId}`), retry: false })
  const inReview = new Set((queue.data?.items ?? []).map((i) => i.prospect.handle))

  if (isLoading) return <p role="status" className="text-sm text-muted">Loading candidates…</p>
  if (error) return <p role="alert" className="text-sm font-medium text-block">{error.message}</p>
  if (!data?.length) return <EmptyState title="No candidates yet" text="Run a search from the Overview." action={{ label: 'Go to Overview', onClick: onOverview }} />

  // Ready: could get a draft now. Same rule as the Overview and the Write drafts button.
  const isReady = (p: Prospect) => p.status !== 'dismissed' && (p.fit === 'strong' || p.fit === 'possible') && !!p.opening && p.opening.freshness !== 'expired' && !inReview.has(p.handle) && p.landsIn !== 'cant_receive'
  const matches: Record<Filter, (p: Prospect) => boolean> = {
    all: () => true,
    ready: isReady,
    drafted: (p) => inReview.has(p.handle),
    not_a_fit: (p) => p.fit === 'not_a_fit',
  }
  const byRelationship = (p: Prospect) => relationship === 'any' || p.relationship === relationship
  const byLandsIn = (p: Prospect) => landsIn === 'any' || (p.landsIn ?? 'unknown') === landsIn
  const shown = sortProspects(data.filter((p) => matches[filter](p) && byRelationship(p) && byLandsIn(p)), sortKey, dir)

  return (
    <div className="pb-16">
      <h1 className="text-[28px] font-bold leading-tight">Candidates</h1>
      <p className="mt-1 text-sm text-muted">The people this campaign found, best fit first. Review holds only the ones with a draft.</p>
      <div className="mt-5 rounded-2xl bg-paper p-4">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${filter === f.id ? 'bg-ink text-white' : 'bg-rail hover:bg-rule'}`}
          >
            {f.label} <span className={filter === f.id ? 'text-white/70' : 'text-muted'}>{data.filter(matches[f.id]).length}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-muted">Relationship</span>
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value as RelationshipFilter)} wrapperClassName="min-w-0 flex-1 sm:w-auto sm:flex-none" className="py-1.5">
            {RELATIONSHIP_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-muted" title={LANDS_IN_HINT}>Likely lands in</span>
          <Select value={landsIn} onChange={(e) => setLandsIn(e.target.value as LandsInFilter)} wrapperClassName="min-w-0 flex-1 sm:w-auto sm:flex-none" className="py-1.5">
            {LANDS_IN_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-muted">Sort by</span>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} wrapperClassName="min-w-0 flex-1 sm:w-auto sm:flex-none" className="py-1.5">
            {SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          className={btnSecondary}
          disabled={sortKey === 'default'}
          aria-label={dir === 'desc' ? 'Sorted high to low, switch to low to high' : 'Sorted low to high, switch to high to low'}
          onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')}
        >
          {dir === 'desc' ? 'High to low' : 'Low to high'}
        </button>
      </div>
      <CandidateActions campaignId={campaignId} unscored={data.filter((p) => p.fit === null && !p.scoring && p.status !== 'dismissed').length} scoring={data.filter((p) => p.scoring).length} ready={data.filter(isReady).length} />
      </div>
      <p className="sr-only" role="status">
        {shown.length === 1 ? '1 candidate shown' : `${shown.length} candidates shown`}
      </p>
      {shown.length === 0 && <p className="mt-6 text-sm text-muted">Nobody in this list.</p>}
      <ul className="mt-5 space-y-1">
        {shown.map((p, i) => (
          <li key={p.id} className="anim-fade-up rounded-2xl px-5 py-5 even:bg-paper" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0 flex-1">
                <a className="min-w-0 text-[17px] font-semibold wrap-anywhere hover:underline" href={`https://x.com/${p.handle}`} target="_blank" rel="noreferrer">
                  {p.name} <span className="text-sm font-normal text-muted">@{p.handle}</span>
                </a>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
                  <FitBadge fit={p.fit} />
                  <span aria-hidden="true">·</span>
                  <span>{metaLine(p)}</span>
                </p>
              </div>
              {p.status === 'dismissed' ? (
                <span className="text-sm font-semibold text-muted">Dismissed</span>
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  {(p.outbox || inReview.has(p.handle)) && (
                    <span key={p.outbox ?? 'draft'} className={`${chip} anim-pop ${p.outbox ? tone[p.outbox === 'Sent' ? 'ok' : 'warn'].chip : tone.ok.chip}`}>{p.outbox ? `In Outbox · ${p.outbox}` : 'Draft written'}</span>
                  )}
                  {p.fit === null ? <ScoreControl p={p} campaignId={campaignId} /> : <DraftControl p={p} campaignId={campaignId} inReview={inReview.has(p.handle)} onReview={onReview} />}
                  {!inReview.has(p.handle) && <DismissControl p={p} campaignId={campaignId} />}
                </div>
              )}
            </div>

            {(p.landsIn === 'cant_receive' || p.fundList || p.identityWarning) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
              {p.landsIn === 'cant_receive' && (
                <p role="note" className="text-sm font-medium text-warn" title={LANDS_IN_HINT}>
                  {deliveryNote(p.landsIn)}
                </p>
              )}
              {p.fundList && (
                <p className="text-sm font-medium text-accent">
                  Known to the fund · {p.fundList.name}
                  {p.fundList.event && <span className="font-normal text-muted"> · {p.fundList.event}</span>}
                </p>
              )}
              {p.identityWarning && <p className="text-sm font-medium text-warn">Identity not confirmed</p>}
            </div>
            )}

            <p className="mt-2.5 line-clamp-2 max-w-[80ch] text-sm text-muted">{p.bio}</p>

            {p.fit && (
              <div className="mt-3 max-w-[80ch] border-l-2 border-rule pl-3">
                {p.opening && p.opening.freshness !== 'expired' ? (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Opening · {p.opening.type}</p>
                    <p className="mt-0.5 text-[15px]">
                      {p.opening.summary}{' '}
                      {p.opening.freshness === 'stale' && <span className="font-medium text-warn">Stale</span>}{' '}
                      {p.opening.url && <XLink href={p.opening.url} label="Open the post on X" />}
                    </p>
                  </>
                ) : (
                  <span className="text-sm text-muted">No reason to reach out yet</span>
                )}
              </div>
            )}

            {p.status !== 'dismissed' && p.call && <InvitationControl p={{ ...p, call: p.call }} campaignId={campaignId} />}

            {(p.claims.length > 0 || p.criteria.length > 0) && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted hover:text-ink">Why this fit ({p.claims.length + p.criteria.length})</summary>
              {p.criteria.length > 0 && p.criteria.every((c) => c.status === 'unknown') && (
                <p className="mt-3 text-xs text-muted">{p.criteria.length} fund criteria unknown: not enough posts read yet.</p>
              )}
              {p.criteria.some((c) => c.status !== 'unknown') && (
                <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                  {p.criteria.map((c) => (
                    <li key={c.text} className={`rounded-full px-2.5 py-1 ${CRITERION_STYLE[c.status]}`}>
                      {c.text}: {CRITERION_LABEL[c.status]}
                    </li>
                  ))}
                </ul>
              )}

              {p.claims.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {p.claims.map((c, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-20 shrink-0 text-xs uppercase text-muted">{c.side}</span>
                      <span>{c.text}</span>
                      <span className={`rounded-full px-2 text-xs ${c.status === 'verified' ? 'bg-ok-bg font-semibold text-ok' : 'bg-rail text-muted'}`}>
                        {c.status === 'verified' ? 'Backed by a post' : 'Our guess'}
                      </span>
                      {c.evidence.map((e) => (
                        <XLink key={e.id} href={e.url} label={e.id.startsWith('bio:') ? 'Open their bio on X' : 'Open the post on X'} />
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
