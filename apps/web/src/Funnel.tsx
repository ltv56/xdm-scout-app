import type { Funnel as FunnelData } from '../../api/src/funnel/contract'
import ReviewSummary from './ReviewSummary'
import { useFunnel } from './useFunnel'

const sum = (data: FunnelData, pick: (l: FunnelData['lanes'][number]) => number) => data.lanes.reduce((n, l) => n + pick(l), 0)

// How far people got, summed over both lanes. Money is in Settings.
export default function Funnel({ campaignId }: { campaignId: number }) {
  const data = useFunnel(campaignId).data
  if (!data || sum(data, (l) => l.found) === 0) return null
  const tiles = [
    ['Found', sum(data, (l) => l.found)],
    ['Strong or Possible', sum(data, (l) => l.goodFit)],
    ['Approved', sum(data, (l) => l.approved)],
    ['Sent', sum(data, (l) => l.sent)],
    ['Replied', sum(data, (l) => l.replied)],
  ] as const
  return (
    <section aria-label="Results so far" className="mt-10 rounded-2xl bg-paper px-6 py-6">
      <h2 className="text-base font-semibold">Results so far</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map(([label, n]) => (
          <li key={label} className="rounded-xl bg-raised px-4 py-3 shadow-soft">
            <p className="text-sm text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-semibold leading-none tabular-nums ${n === 0 ? 'text-muted' : ''}`}>{n}</p>
          </li>
        ))}
      </ul>
      <ReviewSummary campaignId={campaignId} />
    </section>
  )
}
