import { useQuery } from '@tanstack/react-query'
import type { ReviewSummary as Summary, SkipReason } from '../../api/src/review/contract'
import { getJson } from './api'
import { SKIP_LABEL } from './review/labels'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// What reviewers changed: many skips for one reason point at the criteria, many edits at the draft frame.
export default function ReviewSummary({ campaignId }: { campaignId: number }) {
  const summary = useQuery<Summary>({ queryKey: ['review-summary', campaignId], queryFn: () => getJson(`/review-summary?campaignId=${campaignId}`), refetchInterval: 30_000, retry: false })
  const s = summary.data
  if (!s || (s.approved === 0 && s.skipped.length === 0)) return null
  const skipped = s.skipped.reduce((n, r) => n + r.count, 0)

  return (
    <section aria-label="What reviewers changed" className="mt-12">
      <h2 className="text-lg font-bold">What reviewers changed</h2>
      <ul className="mt-3 space-y-1 text-sm">
        <li>
          Approved {s.approved}
          {s.approved > 0 && <span className="text-muted"> · {plural(s.edited, 'draft')} edited first</span>}
        </li>
        {skipped > 0 && (
          <li>
            Skipped {skipped}
            <span className="text-muted"> · {s.skipped.map((r) => `${SKIP_LABEL[r.reason as SkipReason] ?? r.reason} ${r.count}`).join(', ')}</span>
          </li>
        )}
      </ul>
    </section>
  )
}
