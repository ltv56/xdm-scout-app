import { useQuery } from '@tanstack/react-query'
import type { AttentionItem } from '../../../api/src/attention/contract'
import { getJson } from '../api'
import { btnSecondary, chip, tone, type Tone } from '../ui/ui'

const OPEN: Record<NonNullable<AttentionItem['goTo']>, string> = { inbox: 'Open Inbox', profile: 'Open Profile', overview: 'Open Overview', review: 'Open Review' }

// What kind of thing waits, and how urgent: red stops or failed, yellow to check, green a reply to answer.
const KIND: Record<AttentionItem['kind'], { label: string; tone: Tone; bar: string }> = {
  confirm_stop: { label: 'Stop request', tone: 'stop', bar: 'border-l-block' },
  failed: { label: 'Send failed', tone: 'stop', bar: 'border-l-block' },
  outside_reply: { label: 'Replied outside', tone: 'stop', bar: 'border-l-block' },
  x_disconnected: { label: 'X disconnected', tone: 'stop', bar: 'border-l-block' },
  worker_stopped: { label: 'Worker stopped', tone: 'stop', bar: 'border-l-block' },
  check: { label: 'Check in X', tone: 'warn', bar: 'border-l-caution' },
  evidence_deleted: { label: 'Post deleted', tone: 'warn', bar: 'border-l-caution' },
  budget_out: { label: 'Budget used up', tone: 'warn', bar: 'border-l-caution' },
  reply: { label: 'New reply', tone: 'ok', bar: 'border-l-ok' },
}

function waiting(iso: string | null) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return 'waiting less than an hour'
  const hours = Math.round(mins / 60)
  if (hours < 48) return `waiting ${hours} h`
  return `waiting ${Math.round(hours / 24)} days`
}

const MAX_SHOWN = 5

// What needs a person right now, most urgent first. Nothing is shown when nothing waits.
export default function NeedsAttention({ campaignId, onGo }: { campaignId: number; onGo: (page: NonNullable<AttentionItem['goTo']>) => void }) {
  const list = useQuery<AttentionItem[]>({
    queryKey: ['needs-attention', campaignId],
    queryFn: () => getJson(`/needs-attention?campaignId=${campaignId}`),
    refetchInterval: 30_000,
    retry: false,
  })
  const items = list.data ?? []
  if (!items.length) return null
  const shown = items.slice(0, MAX_SHOWN)
  // One button per page to go to, instead of the same button on every row.
  const places = [...new Set(items.flatMap((i) => (i.goTo && i.goTo !== 'overview' ? [i.goTo] : [])))]

  return (
    <section aria-label="Needs attention" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 className="text-lg font-bold">
          Needs attention <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">{items.length}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {places.map((g) => (
            <button key={g} type="button" className={btnSecondary} onClick={() => onGo(g)}>
              {OPEN[g]}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-paper">
        {shown.map((i) => (
          <li key={i.id} className={`border-l-4 px-5 py-3.5 ${KIND[i.kind].bar}`}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              <span className={`${chip} ${tone[KIND[i.kind].tone].chip}`}>{KIND[i.kind].label}</span>
              <span className="wrap-anywhere">{i.title}</span>
              {waiting(i.since) && <span className="text-xs font-medium text-muted">{waiting(i.since)}</span>}
            </p>
            <p className="mt-0.5 text-sm text-muted wrap-anywhere">{i.reason}</p>
          </li>
        ))}
        {items.length > shown.length && <li className="px-5 py-3 text-sm text-muted">and {items.length - shown.length} more</li>}
      </ul>
    </section>
  )
}
