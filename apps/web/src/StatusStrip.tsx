import { useQuery } from '@tanstack/react-query'
import type { TopBar } from '../../api/src/preflight/contract'
import { getJson } from './api'
import { chip, money, tone } from './ui'

// Always on screen: where messages go, how many went out today, what the open campaign cost so far.
export default function StatusStrip({ campaignId }: { campaignId: number | null }) {
  const bar = useQuery<TopBar>({
    queryKey: ['top-bar', campaignId],
    queryFn: () => getJson(`/top-bar${campaignId === null ? '' : `?campaignId=${campaignId}`}`),
    refetchInterval: 30_000,
    retry: false,
  })
  const b = bar.data
  if (!b) return null

  return (
    <div aria-label="Status" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className={`${chip} ${b.mode === 'live' ? tone.stop.chip : tone.done.chip}`}>{b.mode === 'live' ? 'LIVE' : 'SANDBOX'}</span>
      <span>
        Sent today{' '}
        <span className="font-semibold text-ink">
          {b.sentToday} / {b.dailyCap}
        </span>
      </span>
      {b.campaignCostMicros !== null && (
        <span title="Estimated from the X calls and model tokens of this campaign. Exact figures are in the X Developer Console and the model vendor's dashboard.">
          Est. cost <span className="font-semibold text-ink">{money(b.campaignCostMicros)}</span>
          {b.llmUnpriced && <span className="font-semibold text-warn"> · model: no price yet</span>}
        </span>
      )}
      {!b.workerRunning && (
        <span className={`${chip} ${tone.stop.chip} whitespace-nowrap`} title="Nothing is being sent or read until the worker runs again.">
          Worker stopped<span className="sr-only">: nothing is being sent or read</span>
        </span>
      )}
    </div>
  )
}
