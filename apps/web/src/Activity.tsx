import { useQuery } from '@tanstack/react-query'
import type { ActivityRow } from '../../api/src/activity/contract'
import { getJson } from './api'
import { btnSecondary } from './ui'

const WHAT: Record<ActivityRow['kind'], string> = {
  dnc_added: 'Put on Do not contact',
  dnc_removed: 'Taken off Do not contact',
  known_added: 'Added to Known to the fund',
  cap_changed: 'Daily send cap changed',
  known_removed: 'Removed from Known to the fund',
}

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

// What was changed about who may be contacted, with the reason, newest first.
export default function Activity() {
  const rows = useQuery<ActivityRow[]>({ queryKey: ['activity'], queryFn: () => getJson('/activity'), retry: false })
  const list = rows.data ?? []

  return (
    <section aria-label="Activity log" className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Activity log</h2>
        <a className={btnSecondary} href="/api/activity/csv" download>
          Download CSV
        </a>
      </div>
      {rows.error ? (
        <p className="mt-3 text-sm text-block">Could not load the log.</p>
      ) : !list.length ? (
        <p className="mt-3 text-sm text-muted">Nothing has been logged yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule bg-paper">
          {list.map((r) => (
            <li key={r.id} className="px-5 py-3.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span className="font-semibold">
                  {WHAT[r.kind]} · {r.who}
                </span>
                <span className="text-xs text-muted">{when(r.at)}</span>
              </p>
              <p className="text-sm text-muted">{r.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
