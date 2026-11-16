import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { campaignQuery } from '../campaignQuery'
import Spinner from '../ui/Spinner'
import { chip, tone } from '../ui/ui'
import { useTopBar } from '../useTopBar'

// A search runs in the background: say so on every screen, and say when it is done.
function SearchChip({ campaignId, onView }: { campaignId: number | null; onView: () => void }) {
  const c = useQuery({ ...campaignQuery<{ searching: boolean; lastDiscovery: { added: number } | null }>(campaignId ?? 0), enabled: campaignId !== null }).data
  const [done, setDone] = useState<{ id: number; added: number } | null>(null)
  const [seen, setSeen] = useState<{ id: number | null; searching: boolean }>({ id: null, searching: false })

  // A search that was running for this campaign and no longer is: it just finished.
  if (c && campaignId !== null && (seen.id !== campaignId || seen.searching !== c.searching)) {
    setSeen({ id: campaignId, searching: c.searching })
    if (seen.id === campaignId && seen.searching && !c.searching) setDone({ id: campaignId, added: c.lastDiscovery?.added ?? 0 })
  }
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setDone(null), 20_000)
    return () => window.clearTimeout(timer)
  }, [done])

  if (c?.searching) {
    return (
      <span role="status" className={`${chip} ${tone.warn.chip} inline-flex items-center gap-1.5 whitespace-nowrap`} title="A search is running. You can use other screens; it keeps going.">
        <Spinner className="size-3" />
        Searching…
      </span>
    )
  }
  if (!done || done.id !== campaignId) return null
  return (
    <button
      type="button"
      className={`${chip} ${tone.ok.chip} whitespace-nowrap transition-opacity hover:opacity-80`}
      onClick={() => {
        setDone(null)
        onView()
      }}
    >
      Search done · {done.added} added · View
    </button>
  )
}

// Where messages go, plus anything that needs attention. The daily cap shows once it is close; cost lives in Settings.
export default function StatusStrip({ campaignId, onSearchDone = () => {} }: { campaignId: number | null; onSearchDone?: () => void }) {
  const b = useTopBar(campaignId).data
  if (!b) return null
  const reached = b.sentToday >= b.dailyCap
  const close = !reached && b.sentToday >= b.dailyCap * 0.8

  return (
    <div aria-label="Status" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {b.mode !== 'live' && <span className={`${chip} ${tone.done.chip}`}>SANDBOX</span>}
      <SearchChip campaignId={campaignId} onView={onSearchDone} />
      {reached && (
        <span className={`${chip} ${tone.stop.chip} whitespace-nowrap`} title="Nothing more goes out through the API today. Change the cap in Settings.">
          {b.dailyCap === 0 ? 'Daily cap is 0: API sending is off' : `Daily cap reached ${b.sentToday} / ${b.dailyCap}`}
        </span>
      )}
      {close && (
        <span className="whitespace-nowrap font-medium text-warn" title="Change the cap in Settings.">
          Sent today {b.sentToday} / {b.dailyCap}
        </span>
      )}
      {b.llmUnpriced && (
        <span className={`${chip} ${tone.warn.chip} whitespace-nowrap`} title="Cost figures leave out model calls that have no price yet. See Settings, Cost.">
          Model has no price yet
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
