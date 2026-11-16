import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ProfileLink } from '../ui/XLink'
import { useState } from 'react'
import type { Outbox as OutboxData, OutboxItem } from '../../../api/src/outbox/contract'
import { getJson, postJson } from '../api'
import EmptyState from '../ui/EmptyState'
import { XLogo } from '../ui/icons'
import { markOpened, reportOpened, wasOpened, withoutText } from './opened'
import SentCheck from './SentCheck'
import { btnApprove, btnLink, chip, COPIED_NOTE, tone, type Tone } from '../ui/ui'
import { useTopBar } from '../useTopBar'

const TONE: Record<OutboxItem['label'], Tone> = {
  'Waiting to send': 'warn',
  Sending: 'warn',
  Checking: 'warn',
  Sent: 'ok',
  'Send in X': 'warn',
  'Check in X': 'warn',
  Failed: 'stop',
  Cancelled: 'done',
}

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// Every send of the campaign. Refreshes every 5 s while something is on its way, every 30 s otherwise.
export default function Outbox({ campaignId, onReview }: { campaignId: number; onReview: () => void }) {
  const outbox = useQuery<OutboxData>({
    queryKey: ['outbox', campaignId],
    queryFn: () => getJson(`/outbox?campaignId=${campaignId}`),
    refetchInterval: (q) => (q.state.data?.inFlight ? 5_000 : 30_000),
    retry: false,
  })
  const qc = useQueryClient()
  // Sent? after opening X: the worker then looks for the message in the chat; not sent puts the draft back in Review.
  const sentByHand = useMutation({
    mutationFn: ({ draftId, outcome }: { draftId: number; outcome: 'sent' | 'not_sent' }) => postJson(`/drafts/${draftId}/manual`, { outcome }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['outbox', campaignId] }), qc.invalidateQueries({ queryKey: ['inbox-checks', campaignId] })]),
  })
  // Rows opened in X in this page; wasOpened covers the ones opened before a reload.
  const [opened, setOpened] = useState<Set<number>>(() => new Set())
  const isOpened = (draftId: number) => opened.has(draftId) || wasOpened(draftId)
  // The row whose draft was just copied, to say so on screen.
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const copy = (id: number, text: string | null) => {
    if (!text) return
    try {
      void navigator.clipboard.writeText(text).then(() => setCopiedId(id), () => undefined)
    } catch {
      // No clipboard on this page: X still opens.
    }
  }
  const items = outbox.data?.items ?? []
  const topBar = useTopBar(campaignId).data

  if (!outbox.error && !items.length) return <EmptyState title="Nothing sent yet" text="Every send appears here with its state." action={{ label: 'Go to Review', onClick: onReview }} />

  return (
    <section aria-label="Outbox">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[28px] font-bold leading-tight">Outbox</h1>
        {topBar && (
          <p className="text-sm text-muted">
            Sent today {topBar.sentToday} of {topBar.dailyCap}
          </p>
        )}
      </div>
      {items.some((i) => i.route === 'manual') && (
        <p className="mt-1 text-sm text-muted">
          {topBar?.mode === 'fake'
            ? 'Messages you send by hand: the sandbox does not read X, so answer Sent? yourself.'
            : 'Messages you send by hand: after you open the chat we look for your message there during the next day, and mark it sent once it shows. Answer Sent? to settle it sooner.'}
        </p>
      )}
      {outbox.error ? (
        <p className="mt-3 text-sm text-block">Could not load the outbox.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule bg-paper">
          {items.map((i, n) => (
            <li key={i.attemptId} className="anim-fade-up flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5" style={{ animationDelay: `${Math.min(n, 8) * 30}ms` }}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <ProfileLink handle={i.handle} className="text-sm font-semibold">
                    @{i.handle}
                  </ProfileLink>
                  <span key={i.label} className={`${chip} ${tone[TONE[i.label]].chip} anim-pop`}>{i.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{when(i.at)}</p>
                {i.error && <p className="mt-1 text-sm text-muted">{i.error}</p>}
                {i.label === 'Check in X' && i.route === 'manual' && !i.error && <p className="anim-fade-in mt-1 text-sm text-muted">Looking for your message in the chat. If it stays here, confirm it in Inbox.</p>}
                {sentByHand.isError && sentByHand.variables?.draftId === i.draftId && <p role="alert" className="mt-1 text-sm text-block">{sentByHand.error.message}</p>}
                {copiedId === i.attemptId && (
                  <p role="status" className="anim-fade-in mt-1 text-sm text-ok">
                    {COPIED_NOTE}
                  </p>
                )}
              </div>
              {i.openInX &&
                (isOpened(i.draftId) ? (
                  <div className="flex items-center gap-3">
                    <a className={`${btnLink} text-xs`} href={withoutText(i.openInX)} target="_blank" rel="noreferrer" onClick={() => reportOpened(i.draftId)}>
                      open chat
                    </a>
                    <button type="button" className={`${btnLink} text-xs`} onClick={() => copy(i.attemptId, i.text)}>
                      copy draft
                    </button>
                    <SentCheck pending={sentByHand.isPending} onAnswer={(outcome) => sentByHand.mutate({ draftId: i.draftId, outcome })} />
                  </div>
                ) : (
                  <a
                    className={`${btnApprove} gap-2`}
                    href={i.openInX}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open chat on X"
                    onClick={() => {
                      markOpened(i.draftId)
                      reportOpened(i.draftId)
                      setOpened((cur) => new Set(cur).add(i.draftId))
                      copy(i.attemptId, i.text)
                    }}
                  >
                    Open chat on
                    <XLogo className="size-3.5" />
                  </a>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
