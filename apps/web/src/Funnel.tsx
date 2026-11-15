import { useQuery } from '@tanstack/react-query'
import type { Funnel as FunnelData } from '../../api/src/funnel/contract'
import { getJson } from './api'
import { money } from './ui'

const LANE = { search: 'Found by search', call: 'Answered the call post' }

// Counts and money only: how far people got, what X billed, and what a conversation cost.
export default function Funnel({ campaignId }: { campaignId: number }) {
  const funnel = useQuery<FunnelData>({ queryKey: ['funnel', campaignId], queryFn: () => getJson(`/funnel?campaignId=${campaignId}`), refetchInterval: 30_000, retry: false })
  const data = funnel.data
  if (!data) return null
  const rows: [string, (l: FunnelData['lanes'][number]) => string | number][] = [
    ['Found', (l) => l.found],
    ['Strong or Possible', (l) => l.goodFit],
    ['Approved', (l) => l.approved],
    ['Sent', (l) => l.sent],
    ['Replied', (l) => l.replied],
    ['Conversations', (l) => l.conversations],
    ['X cost', (l) => money(l.costMicros)],
    ['Per conversation', (l) => (l.costPerConversationMicros === null ? '–' : money(l.costPerConversationMicros))],
  ]
  return (
    <section aria-label="Results so far" className="mt-12">
      <h2 className="text-lg font-bold">Results so far</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-rule bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium" />
              {data.lanes.map((l) => (
                <th key={l.lane} className="px-5 py-3 text-right font-medium">
                  {LANE[l.lane]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th className="px-5 py-2.5 text-left font-normal text-muted">{label}</th>
                {data.lanes.map((l) => (
                  <td key={l.lane} className="px-5 py-2.5 text-right font-semibold tabular-nums">
                    {value(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">X cost is an estimate from the calls made for this campaign: {money(data.totalMicros)} so far. A conversation is a reply that is Interested or a Question.</p>
    </section>
  )
}
