import { when } from '../format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ProfileLink } from '../ui/XLink'
import { useState } from 'react'
import type { Outbox as OutboxData, OutboxItem } from '../../../api/src/outbox/contract'
import type { ReplyClass } from '../../../api/src/inbox/reply-class'
import { getJson, postJson } from '../api'
import ConfirmInline from '../ui/ConfirmInline'
import EmptyState from '../ui/EmptyState'
import { XLogo } from '../ui/icons'
import { btnApprove, btnToolbar, chip, COPIED_NOTE, tone, type Tone } from '../ui/ui'
import { useTopBar } from '../useTopBar'
import SentCheck from './SentCheck'

const TONE: Record<OutboxItem['label'], Tone> = {
  'Waiting to send': 'warn',
  Sending: 'warn',
  Checking: 'warn',
  Sent: 'ok',
  'Send in X': 'warn',
  'Did you send it?': 'warn',
  'Sent by hand': 'ok',
  'Check in X': 'warn',
  Failed: 'stop',
  Cancelled: 'done',
}

const REPLY_TONE: Record<ReplyClass, Tone> = {
  Interested: 'ok',
  Question: 'warn',
  'Not now': 'done',
  'Not interested': 'stop',
  'Opt-out': 'stop',
  Unclear: 'done',
}

const SENT_LABELS: OutboxItem['label'][] = ['Sent', 'Sent by hand']
const reopenLink = 'inline-flex items-center gap-1.5 rounded-lg border border-rule bg-raised px-3 py-1.5 text-sm font-medium transition-colors hover:border-ink hover:bg-rail'

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
  // Opening the chat is recorded; the row then asks whether it was sent.
  const opened = useMutation({ mutationFn: (draftId: number) => postJson(`/drafts/${draftId}/opened`, {}), onSuccess: refresh })
  // Yes counts it as sent by hand; No (or Not sent later) puts the draft back in Review.
  const answer = useMutation({ mutationFn: (v: { draftId: number; outcome: 'sent' | 'not_sent' }) => postJson(`/drafts/${v.draftId}/manual`, { outcome: v.outcome }), onSuccess: refresh })
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

  const busy = (draftId: number) => answer.isPending && answer.variables?.draftId === draftId
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
      {items.some((i) => i.route === 'manual') && <p className="mt-1 text-sm text-muted">A message you send yourself in X counts as sent once you say so. Not sent puts the draft back in Review.</p>}
      {outbox.error ? (
        <p className="mt-3 text-sm text-block">Could not load the outbox.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule bg-paper">
          {items.map((i, n) => (
            <li key={i.attemptId} className="anim-fade-up flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5" style={{ animationDelay: `${Math.min(n, 8) * 30}ms` }}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <ProfileLink handle={i.handle} className="text-sm font-semibold">
                    {i.name ?? `@${i.handle}`}
                  </ProfileLink>
                  {i.name && <span className="text-sm text-muted">@{i.handle}</span>}
                  <span key={i.label} className={`${chip} ${tone[TONE[i.label]].chip} anim-pop`}>{i.label}</span>
                  {i.reply ? (
                    <span className={`${chip} ${tone[REPLY_TONE[i.reply]].chip}`}>Replied · {i.reply}</span>
                  ) : (
                    SENT_LABELS.includes(i.label) && <span className={`${chip} ${tone.done.chip}`}>No reply yet</span>
                  )}
                </div>
                {i.preview && <p className="mt-1 max-w-[70ch] truncate text-sm text-muted">{i.preview}</p>}
                <p className="mt-0.5 text-xs text-muted">
                  {i.route === 'manual' ? 'By hand in X' : 'By xdm-scout'} · {when(i.at)}
                </p>
                {i.error && <p className="mt-1 text-sm text-muted">{i.error}</p>}
                {i.label === 'Check in X' && !i.error && <p className="anim-fade-in mt-1 text-sm text-muted">X did not confirm this send. Check it under Messages &gt; Inbox.</p>}
                {opened.isError && opened.variables === i.draftId && <p role="alert" className="mt-1 text-sm text-block">{opened.error.message}</p>}
                {answer.isError && answer.variables?.draftId === i.draftId && <p role="alert" className="mt-1 text-sm text-block">{answer.error.message}</p>}
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
                      pending={busy(i.draftId)}
                      onConfirm={() => answer.mutate({ draftId: i.draftId, outcome: 'not_sent' })}
                      className={`${btnToolbar} text-muted hover:text-ink`}
                    />
                    <a className={reopenLink} href={i.openInX} target="_blank" rel="noreferrer" aria-label={`Open the chat with @${i.handle} on X`}>
                      Open chat
                      <XLogo className="size-3.5" />
                    </a>
                  </div>
                ) : i.label === 'Did you send it?' ? (
                  <div className="flex items-center gap-2">
                    <a className={reopenLink} href={i.openInX} target="_blank" rel="noreferrer" aria-label={`Open the chat with @${i.handle} on X`}>
                      Open chat
                      <XLogo className="size-3.5" />
                    </a>
                    <SentCheck pending={busy(i.draftId)} onAnswer={(outcome) => answer.mutate({ draftId: i.draftId, outcome })} />
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
