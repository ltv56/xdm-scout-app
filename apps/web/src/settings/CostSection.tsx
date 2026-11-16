import type { Funnel as FunnelData } from '../../../api/src/funnel/contract'
import { useFunnel } from '../overview/useFunnel'
import { money } from '../ui/ui'

const NO_PRICE = 'no price yet'
const LANE = { search: 'Found by search', call: 'Answered the call post' }

// What X billed and what the model cost, per lane, for the open campaign.
export default function CostSection({ campaignId }: { campaignId: number }) {
  const data = useFunnel(campaignId).data
  if (!data) return null
  const rows: [string, (l: FunnelData['lanes'][number]) => string][] = [
    ['X cost', (l) => money(l.costMicros)],
    ['Model cost', (l) => (l.llmUnpriced ? NO_PRICE : money(l.llmCostMicros))],
    ['Per conversation', (l) => (l.costPerConversationMicros === null ? '–' : l.llmUnpriced ? NO_PRICE : money(l.costPerConversationMicros))],
  ]
  return (
    <section aria-label="Cost" className="max-w-xl">
      <h3 className="text-xl font-bold">Cost</h3>
      <p className="mt-1 text-sm text-muted">For the campaign that is open.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-paper">
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
      <p className="mt-2 text-xs text-muted">
        X cost is an estimate from the calls made for this campaign; model cost is priced from the tokens the model reported. {money(data.totalMicros)} so far, both together{data.llmUnpriced && ', not counting model calls with no price yet'}. A conversation is a reply that is Interested or a Question.
      </p>
    </section>
  )
}
