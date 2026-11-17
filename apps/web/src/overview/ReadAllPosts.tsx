import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { postJson } from '../api'
import { plural } from '../format'
import { btnLink, btnSmall, btnSmallQuiet, money } from '../ui/ui'

type Result = { people: number; posts: number; prospectIds: number[]; costMicros: number; spentMicros: number; budgetMicros: number }

// 15 posts at $0.005 each, the most one read can cost.
const PER_PERSON = 75_000
const SCORE_EACH = 10_000

// Reads the posts of everyone the search left unread, after the user agrees to the cost. Scoring them again is offered, not done.
export default function ReadAllPosts({ campaignId, waiting, onCandidates }: { campaignId: number; waiting: number; onCandidates: () => void }) {
  const qc = useQueryClient()
  const [asking, setAsking] = useState(false)
  const read = useMutation({
    mutationFn: () => postJson<Result>(`/campaigns/${campaignId}/read-posts`, { raiseBudget: true }),
    onSuccess: () => {
      setAsking(false)
      return Promise.all([qc.invalidateQueries({ queryKey: ['campaign', campaignId] }), qc.invalidateQueries({ queryKey: ['prospects', campaignId] })])
    },
  })
  const rescore = useMutation({
    mutationFn: (ids: number[]) => postJson<{ queued: number }>(`/campaigns/${campaignId}/score`, { prospectIds: ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', campaignId] }),
  })

  if (read.data) {
    const r = read.data
    return (
      <div role="status" aria-live="polite" className="mt-3">
        <p>
          Read {plural(r.posts, 'post')} from {plural(r.people, 'person', 'people')} for {money(r.costMicros)}. Campaign spend {money(r.spentMicros)} of {money(r.budgetMicros)}.
        </p>
        {r.posts > 0 && !rescore.isSuccess && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" className={btnSmall} disabled={rescore.isPending} onClick={() => rescore.mutate(r.prospectIds)}>
              {rescore.isPending ? 'Asking…' : `Score them again · under ${money(r.people * SCORE_EACH)}`}
            </button>
            <span className="text-xs text-muted">Uses the model on the new posts. Fit and openings may change.</span>
          </p>
        )}
        {rescore.isSuccess && <p className="mt-2">Scoring {plural(rescore.data.queued, 'person', 'people')} again. Candidates update when it is done.</p>}
        {rescore.error && <p role="alert" className="mt-2 font-medium text-block">{rescore.error.message}</p>}
      </div>
    )
  }
  if (waiting === 0) return <p className="mt-1">Raise the budget in Settings to search further.</p>

  return (
    <>
      <p className="mt-1">{plural(waiting, 'person', 'people')} found but not read yet, so they have no opening and get no draft.</p>
      {asking ? (
        <div className="mt-3 rounded-xl border border-caution/60 bg-raised p-3">
          <p>
            Reads up to 15 newest posts each from X. Costs up to {money(waiting * PER_PERSON)}. If the budget is used up, it goes up by what this read needs, no more.
          </p>
          <p className="mt-3 flex items-center gap-3">
            <button type="button" className={btnSmall} disabled={read.isPending} onClick={() => read.mutate()}>
              {read.isPending ? 'Reading…' : 'Read posts'}
            </button>
            <button type="button" className={btnLink} onClick={() => setAsking(false)}>
              Cancel
            </button>
          </p>
          {read.error && <p role="alert" className="mt-2 font-medium text-block">{read.error.message}</p>}
        </div>
      ) : (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" className={btnSmall} onClick={() => setAsking(true)}>
            Read posts for all {waiting}
          </button>
          <span className="text-xs text-muted">Up to {money(waiting * PER_PERSON)}, about $0.005 a post</span>
          <button type="button" className={btnSmallQuiet} onClick={onCandidates}>
            Go to Candidates
          </button>
        </p>
      )}
    </>
  )
}
