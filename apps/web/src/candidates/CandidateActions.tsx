import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { WriteDraftsResult } from '../../../api/src/review/contract'
import { postJson } from '../api'
import Spinner from '../ui/Spinner'
import { btnApprove, btnSecondary } from '../ui/ui'
import { plural } from '../format'

// The two things done to many candidates at once: score everyone not scored yet, write drafts for everyone who is ready.
export default function CandidateActions({ campaignId, unscored, scoring, drafting, ready }: { campaignId: number; unscored: number; scoring: number; drafting: number; ready: number }) {
  const qc = useQueryClient()
  const [note, setNote] = useState<string | null>(null)
  const [wrote, setWrote] = useState(0)
  const [seenDrafting, setSeenDrafting] = useState(false)
  if (drafting > 0 && !seenDrafting) setSeenDrafting(true)
  // A fast worker can finish between two polls, so stop waiting to see it after a while.
  useEffect(() => {
    if (wrote === 0 || seenDrafting) return
    const t = setTimeout(() => setSeenDrafting(true), 10_000)
    return () => clearTimeout(t)
  }, [wrote, seenDrafting])
  // The worker writes in the background: say "writing" until the drafts we asked for have come and gone.
  const writing = wrote > 0 && (drafting > 0 || !seenDrafting)

  const score = useMutation({
    mutationFn: () => postJson<{ queued: number }>(`/campaigns/${campaignId}/score`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', campaignId] }),
  })
  const write = useMutation({
    mutationFn: () => postJson<WriteDraftsResult>(`/campaigns/${campaignId}/drafts`, { limit: 10 }),
    onSuccess: (r) => {
      setWrote(r.drafted)
      setSeenDrafting(false)
      setNote(
        r.drafted === 0
          ? `Nobody is ready for a draft.${r.cantReceive ? ` ${plural(r.cantReceive, 'person', 'people')} left out: X says their DMs are closed.` : ''}`
          : `${r.readyToDraft ? ` ${plural(r.readyToDraft, 'more person', 'more people')} still waiting.` : ''}${r.noOpening ? ` ${plural(r.noOpening, 'person', 'people')} skipped: no reason to reach out yet.` : ''}${r.cantReceive ? ` ${plural(r.cantReceive, 'person', 'people')} left out: X says their DMs are closed.` : ''}`.trim(),
      )
      return Promise.all(['review-queue', 'ready', 'prospects'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
    },
  })

  if (unscored === 0 && scoring === 0 && drafting === 0 && ready === 0 && !note && wrote === 0) return null
  const batch = Math.min(ready, 10)
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {scoring > 0 && (
          <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-3.5" />
            Scoring… {plural(scoring, 'person', 'people')} left
          </span>
        )}
        {drafting > 0 && !writing && (
          <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-3.5" />
            Writing drafts… {drafting} left
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
              {write.isPending ? 'Starting…' : `Write ${plural(batch, 'draft')}`}
            </button>
            <span className="text-xs text-muted">
              {plural(ready, 'person is', 'people are')} ready.{ready > 10 ? ' Up to 10 at a time, so you can read each one: strong first, then closer ties, then the newest posts.' : ''}
            </span>
          </>
        )}
      </div>
      {(note || wrote > 0) && (
        <p className="mt-3 text-sm font-medium" role="status">
          {wrote > 0 && (writing ? `Writing ${plural(wrote, 'draft')}. Each one shows up in Review when it is done. ` : `${plural(wrote, 'draft')} written. Open Review to read them. `)}
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
