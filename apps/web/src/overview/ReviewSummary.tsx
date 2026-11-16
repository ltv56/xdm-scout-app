import { useQuery } from '@tanstack/react-query'
import type { ReviewSummary as Summary, SkipReason } from '../../../api/src/review/contract'
import { getJson } from '../api'
import { SKIP_LABEL } from '../review/labels'
import { plural } from '../format'

// Under Results so far: many skips for one reason point at the criteria, many edits at the draft frame.
export default function ReviewSummary({ campaignId }: { campaignId: number }) {
  const summary = useQuery<Summary>({ queryKey: ['review-summary', campaignId], queryFn: () => getJson(`/review-summary?campaignId=${campaignId}`), refetchInterval: 30_000, retry: false })
  const s = summary.data
  if (!s) return null
  const skipped = s.skipped.reduce((n, r) => n + r.count, 0)
  if (s.edited === 0 && skipped === 0) return null
  const parts = [
    s.edited > 0 ? `${plural(s.edited, 'approved draft was', 'approved drafts were')} edited first` : null,
    skipped > 0 ? `Skipped ${skipped}: ${s.skipped.map((r) => `${SKIP_LABEL[r.reason as SkipReason] ?? r.reason} ${r.count}`).join(', ')}` : null,
  ].filter(Boolean)
  return <p className="mt-3 text-sm text-muted">{parts.join(' · ')}</p>
}
