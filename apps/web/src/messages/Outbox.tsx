import { when } from '../format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ProfileLink } from '../ui/XLink'
import { useState } from 'react'
import type { Outbox as OutboxData, OutboxItem } from '../../../api/src/outbox/contract'
import { getJson, postJson } from '../api'
import ConfirmInline from '../ui/ConfirmInline'
import EmptyState from '../ui/EmptyState'
import { XLogo } from '../ui/icons'
import { btnApprove, btnToolbar, chip, COPIED_NOTE, tone, type Tone } from '../ui/ui'
import { useTopBar } from '../useTopBar'

const TONE: Record<OutboxItem['label'], Tone> = {
  'Waiting to send': 'warn',
  Sending: 'warn',
  Checking: 'warn',
  Sent: 'ok',
  'Send in X': 'warn',
  'Sent by hand': 'ok',
  'Check in X': 'warn',
  Failed: 'stop',
  Cancelled: 'done',
}


// Every send of the campaign. Refreshes every 5 s while something is on its way, every 30 s otherwise.
export default function Outbox({ campaignId, onReview }: { campaignId: number; onReview: () => void }) {
  const outbox = useQuery<OutboxData>({
    queryKey: ['outbox', campaignId],
    queryFn: () => getJson(`/outbox?campaignId=${campaignId}`),
    refetchInterval: (q) => (q.state.data?.inFlight ? 5_000 : 30_000),
    retry: false,
  })
  const qc = useQueryClient()
  const refresh = () => Promise.all(['outbox', 'inbox-checks', 'review-queue', 'top-bar'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
  // Opening the chat counts as sent by hand.
  const opened = useMutation({ mutationFn: (draftId: number) => postJson(`/drafts/${draftId}/opened`, {}), onSuccess: refresh })
  // Not sent takes a hand-send back: the draft returns to Review.
  const notSent = useMutation({ mutationFn: (draftId: number) => postJson(`/drafts/${draftId}/manual`, { outcome: 'not_sent' }), onSuccess: refresh })
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
          Opening the chat counts as sent by hand. If you did not send it, press Not sent and the draft goes back to Review.
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
                {i.label === 'Check in X' && !i.error && <p className="anim-fade-in mt-1 text-sm text-muted">X did not confirm this send. Check it under Messages &gt; Inbox.</p>}
                {[opened, notSent].map((mu) => mu.isError && mu.variables === i.draftId && <p key={mu === opened ? 'o' : 'n'} role="alert" className="mt-1 text-sm text-block">{mu.error.message}</p>)}
                {copiedId === i.attemptId && (
                  <p role="status" className="anim-fade-in mt-1 text-sm text-ok">
                    {COPIED_NOTE}
                  </p>
                )}
              </div>
              {i.openInX &&
                (i.label === 'Sent by hand' ? (
                  <div className="flex items-center gap-2">
                    <ConfirmInline
                      label="Not sent"
                      title="Did not send it in X? This takes the send back and the draft returns to Review."
                      question="Didn't send it?"
                      confirmLabel="Yes, take it back"
                      pending={notSent.isPending && notSent.variables === i.draftId}
                      onConfirm={() => notSent.mutate(i.draftId)}
                      className={`${btnToolbar} text-muted hover:text-ink`}
                    />
                    <a
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-raised px-3 py-1.5 text-sm font-medium transition-colors hover:border-ink hover:bg-rail"
                      href={i.openInX}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open the chat with @${i.handle} on X`}
                    >
                      Open chat
                      <XLogo className="size-3.5" />
                    </a>
                  </div>
                ) : (
                  <a
                    className={`${btnApprove} gap-2`}
                    href={i.openInX}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open chat on X"
                    onClick={() => {
                      opened.mutate(i.draftId)
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
