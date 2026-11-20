import { count } from '../format'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SkipReason } from '../../../api/src/review/contract'
import { postJson } from '../api'
import { deliveryNote, LANDS_IN_HINT, SKIP_LABEL, SKIP_REASONS } from '../review/labels'
import { CheckCircle, More } from '../ui/icons'
import Select from '../ui/Select'
import Spinner from '../ui/Spinner'
import InfoTip from '../ui/InfoTip'
import XLink from '../ui/XLink'
import { btnLink, btnOutline, btnSecondary, btnSmall, chip, tone } from '../ui/ui'
import FitBadge from './FitBadge'
import type { Prospect } from './Prospects'
import { CLAIM_CHIP, INFO } from './why'

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'today' : `${days}d ago`
}

// "Draft a message": one person, on request. It writes the draft and puts it in Review. Anyone but Not a fit; with no opening post it opens with their profile.
export function DraftControl({ p, campaignId, inReview, onReview }: { p: Prospect; campaignId: number; inReview: boolean; onReview: (handle?: string) => void }) {
  const qc = useQueryClient()
  const make = useMutation({
    mutationFn: () =>
      postJson(`/campaigns/${campaignId}/prospects/${p.id}/draft`),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['review-queue'] }), qc.invalidateQueries({ queryKey: ['ready'] })]),
  })
  const why = p.fit === null ? 'Not scored yet' : p.fit === 'not_a_fit' ? 'Not a fit' : p.noOpening?.cause === 'posts_not_read' ? 'Read their posts first' : null
  const fromProfile = !why && !!p.noOpening

  if (p.outbox) return null
  if (inReview || make.isSuccess) {
    return (
      <button type="button" className={btnOutline} onClick={() => onReview(p.handle)}>
        Open in Review
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span title={why ?? undefined} className="inline-flex"><button type="button" className={btnSecondary} disabled={!!why || make.isPending} onClick={() => make.mutate()}>
        {make.isPending ? 'Writing…' : fromProfile ? 'Draft from their profile' : 'Draft a message'}
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
export function ScoreControl({ p, campaignId }: { p: Prospect; campaignId: number }) {
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
    <div className={`mt-3 max-w-[80ch] rounded-xl px-4 py-3 text-sm bg-rail/60`}>
      <p className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted`}>
        They messaged you after your call post
        <InfoTip
          label="Call post"
          text="They answered the call post you published, so they messaged first. Once you confirm it as an invitation, the app may send your reply through the API for 30 days."
        />
      </p>
      <p className="mt-1 italic wrap-anywhere">“{p.call.text}”</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {p.call.invitationConfirmed ? (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <CheckCircle className="size-4 text-ok" />
            Invitation confirmed
          </span>
        ) : (
          <button
            type="button"
            className={btnSmall}
            aria-label="Confirm invitation"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            {confirm.isPending ? 'Confirming…' : 'Confirm'}
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
    `${count(p.followers)} followers`,
    p.lastPostAt ? `last post ${daysAgo(p.lastPostAt)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

interface Props {
  p: Prospect
  index: number
  campaignId: number
  inReview: boolean
  onReview: (handle?: string) => void
  onOpen: (opener: HTMLElement) => void
}

// Short form of why there is nothing to write about; the detail says it in full.
const NO_OPENING_SHORT = { posts_not_read: 'posts not read: the search hit its budget', no_recent_post: 'no recent post about their own work', expired: 'the opening is over 90 days old' }

export default function CandidateRow({ p, index, campaignId, inReview, onReview, onOpen }: Props) {
  return (
    <li className="anim-fade-up rounded-2xl px-5 py-5 even:bg-paper" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <button type="button" className="min-w-0 text-left text-[17px] font-semibold wrap-anywhere hover:underline" onClick={(e) => onOpen(e.currentTarget)}>
              {p.name || `@${p.handle}`}
            </button>
            <span className="text-sm text-muted">@{p.handle}</span>
            <XLink href={`https://x.com/${p.handle}`} label={`Open @${p.handle} on X`} />
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <FitBadge fit={p.fit} />
              <InfoTip label="Fit" text={p.fit === null ? INFO.unscored : INFO.fit} />
            </span>
            <span aria-hidden="true">·</span>
            <span>{metaLine(p)}</span>
          </p>
          {p.why && (
            <p className="mt-1 line-clamp-2 max-w-[80ch] text-sm">
              <span className={`${chip} ${p.why.status === 'unsure' ? CLAIM_CHIP.unsure.className : 'bg-rail text-muted'}`}>{CLAIM_CHIP[p.why.status].label}</span>
              <InfoTip label={CLAIM_CHIP[p.why.status].label} text={CLAIM_CHIP[p.why.status].meaning} />{' '}
              <span className="text-muted">Mainly because: </span>
              {p.why.text}
            </p>
          )}
          {p.fit === null && !p.scoring && <p className="mt-1 text-sm text-muted">Not scored yet: Score reads their posts and decides how well they fit.</p>}
        </div>
        {p.status === 'dismissed' ? (
          <span className="text-sm font-semibold text-muted">Dismissed</span>
        ) : (
          <div className="flex shrink-0 items-center gap-3">
            {(p.outbox || inReview) && (
              <span key={p.outbox ?? 'draft'} className={`${chip} anim-pop ${p.outbox ? tone[p.outbox === 'Sent' ? 'ok' : 'warn'].chip : tone.done.chip}`}>{p.outbox ? `In Outbox · ${p.outbox}` : 'Draft written'}</span>
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

      {p.bio && <p className="mt-2.5 line-clamp-2 max-w-[80ch] text-sm italic text-muted wrap-anywhere">“{p.bio}”</p>}

      {p.fit && (
        <div className={`mt-3 max-w-[80ch] border-l-2 pl-3 ${!p.opening || p.opening.freshness === 'expired' ? 'border-caution' : p.opening.freshness === 'stale' ? 'border-fit-possible' : 'border-rule'}`}>
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
            <p className="text-sm text-muted">
              <span className="font-medium text-warn">No recent post to open with</span>
              {p.noOpening && <> · {NO_OPENING_SHORT[p.noOpening.cause]}</>}
            </p>
          )}
        </div>
      )}

      {p.status !== 'dismissed' && p.call && <InvitationControl p={{ ...p, call: p.call }} campaignId={campaignId} />}

      <button type="button" className={`${btnLink} mt-3 text-muted`} onClick={(e) => onOpen(e.currentTarget)}>
        {p.fit === null ? 'Details' : `See why · ${p.claims.length} ${p.claims.length === 1 ? 'reason' : 'reasons'}${p.criteria.length ? `, ${p.criteria.length} criteria` : ''}`}
      </button>
    </li>
  )
}
