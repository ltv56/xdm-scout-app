import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SkipReason } from '../../../api/src/review/contract'
import { postJson } from '../api'
import { deliveryNote, LANDS_IN_HINT, SKIP_LABEL, SKIP_REASONS } from '../review/labels'
import { More } from '../ui/icons'
import Select from '../ui/Select'
import Spinner from '../ui/Spinner'
import XLink from '../ui/XLink'
import { btnLink, btnOutline, btnSecondary, chip, tone } from '../ui/ui'
import FitBadge from './FitBadge'
import type { Prospect } from './Prospects'

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

interface Props {
  p: Prospect
  index: number
  campaignId: number
  inReview: boolean
  onReview: () => void
}

export default function CandidateRow({ p, index, campaignId, inReview, onReview }: Props) {
  return (
    <li className="anim-fade-up rounded-2xl px-5 py-5 even:bg-paper" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
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
            {(p.outbox || inReview) && (
              <span key={p.outbox ?? 'draft'} className={`${chip} anim-pop ${p.outbox ? tone[p.outbox === 'Sent' ? 'ok' : 'warn'].chip : tone.ok.chip}`}>{p.outbox ? `In Outbox · ${p.outbox}` : 'Draft written'}</span>
            )}
            {p.fit === null ? <ScoreControl p={p} campaignId={campaignId} /> : <DraftControl p={p} campaignId={campaignId} inReview={inReview} onReview={onReview} />}
            {!inReview && <DismissControl p={p} campaignId={campaignId} />}
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
  )
}
