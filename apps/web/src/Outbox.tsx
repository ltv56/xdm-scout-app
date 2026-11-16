import { useQuery } from '@tanstack/react-query'
import type { Outbox as OutboxData, OutboxItem } from '../../api/src/outbox/contract'
import { getJson } from './api'
import EmptyState from './EmptyState'
import { chip, tone, type Tone } from './ui'
import { useTopBar } from './useTopBar'

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

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

// Every send of the campaign. Refreshes every 5 s while something is on its way, every 30 s otherwise.
export default function Outbox({ campaignId, onReview }: { campaignId: number; onReview: () => void }) {
  const outbox = useQuery<OutboxData>({
    queryKey: ['outbox', campaignId],
    queryFn: () => getJson(`/outbox?campaignId=${campaignId}`),
    refetchInterval: (q) => (q.state.data?.inFlight ? 5_000 : 30_000),
    retry: false,
  })
  const items = outbox.data?.items ?? []
  const topBar = useTopBar(campaignId).data

  if (!outbox.error && !items.length) return <EmptyState title="Nothing sent yet" text="Every send appears here with its state." action={{ label: 'Go to Review', onClick: onReview }} />

  return (
    <section aria-label="Outbox">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Outbox</h2>
        {topBar && (
          <p className="text-sm text-muted">
            Sent today {topBar.sentToday} of {topBar.dailyCap}
          </p>
        )}
      </div>
      {outbox.error ? (
        <p className="mt-3 text-sm text-block">Could not load the outbox.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule bg-paper">
          {items.map((i) => (
            <li key={i.attemptId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">@{i.handle}</p>
                {i.error && <p className="text-sm text-muted">{i.error}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{when(i.at)}</span>
                <span className={`${chip} ${tone[TONE[i.label]].chip}`}>{i.label}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
