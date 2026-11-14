import { useQuery } from '@tanstack/react-query'
import type { AttentionItem } from '../../api/src/attention/contract'
import { getJson } from './api'
import { btnSecondary } from './ui'

const OPEN: Record<NonNullable<AttentionItem['goTo']>, string> = { inbox: 'Open Inbox', profile: 'Open Profile', overview: 'Open' }

function waiting(iso: string | null) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return 'waiting less than an hour'
  const hours = Math.round(mins / 60)
  if (hours < 48) return `waiting ${hours} h`
  return `waiting ${Math.round(hours / 24)} days`
}

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

  return (
    <section aria-label="Needs attention" className="mt-8">
      <h2 className="text-lg font-bold">
        Needs attention <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">{items.length}</span>
      </h2>
      <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule bg-paper">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {i.title}
                {waiting(i.since) && <span className="ml-2 text-xs font-medium text-muted">{waiting(i.since)}</span>}
              </p>
              <p className="text-sm text-muted">{i.reason}</p>
            </div>
            {i.goTo && (
              <button type="button" className={btnSecondary} onClick={() => onGo(i.goTo as NonNullable<AttentionItem['goTo']>)}>
                {OPEN[i.goTo]}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
