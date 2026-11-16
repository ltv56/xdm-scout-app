import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { WriteDraftsResult } from '../../api/src/review/contract'
import { postJson } from './api'
import Spinner from './Spinner'
import { btnApprove, btnSecondary } from './ui'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// The two things done to many candidates at once: score everyone not scored yet, write drafts for everyone who is ready.
export default function CandidateActions({ campaignId, unscored, scoring, ready }: { campaignId: number; unscored: number; scoring: number; ready: number }) {
  const qc = useQueryClient()
  const [note, setNote] = useState<string | null>(null)

  const score = useMutation({
    mutationFn: () => postJson<{ queued: number }>(`/campaigns/${campaignId}/score`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', campaignId] }),
  })
  const write = useMutation({
    mutationFn: () => postJson<WriteDraftsResult>(`/campaigns/${campaignId}/drafts`, { limit: 10 }),
    onSuccess: (r) => {
      setNote(
        r.drafted === 0
          ? `Nobody is ready for a draft.${r.cantReceive ? ` ${plural(r.cantReceive, 'person', 'people')} left out: X says their DMs are closed.` : ''}`
          : `Wrote ${plural(r.drafted, 'draft')}.${r.readyToDraft ? ` ${plural(r.readyToDraft, 'more person', 'more people')} still waiting.` : ''}${r.noOpening ? ` ${plural(r.noOpening, 'person', 'people')} skipped: no reason to reach out yet.` : ''}${r.cantReceive ? ` ${plural(r.cantReceive, 'person', 'people')} left out: X says their DMs are closed.` : ''}`,
      )
      return Promise.all([qc.invalidateQueries({ queryKey: ['review-queue'] }), qc.invalidateQueries({ queryKey: ['ready'] })])
    },
  })

  if (unscored === 0 && scoring === 0 && ready === 0 && !note) return null
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {scoring > 0 && (
          <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-3.5" />
            Scoring… {plural(scoring, 'person', 'people')} left
          </span>
        )}
        {unscored > 0 && (
          <button type="button" className={ready > 0 ? btnSecondary : btnApprove} disabled={score.isPending} onClick={() => score.mutate()}>
            {score.isPending ? 'Queuing…' : `Score all (${unscored})`}
          </button>
        )}
        {ready > 0 && (
          <>
            <button type="button" className={btnApprove} disabled={write.isPending} onClick={() => write.mutate()}>
              {write.isPending ? 'Writing…' : 'Write drafts (10)'}
            </button>
            <span className="text-xs text-muted">{plural(ready, 'person is', 'people are')} ready. Up to 10 at a time, so you can read each one. Strong first, then closer ties, then the newest posts.</span>
          </>
        )}
      </div>
      {note && (
        <p className="mt-3 text-sm font-medium" role="status">
          {note}
        </p>
      )}
      {(score.error || write.error) && (
        <p className="mt-3 text-sm font-medium text-block" role="alert">
          {(score.error ?? write.error)?.message}
        </p>
      )}
    </div>
  )
}
