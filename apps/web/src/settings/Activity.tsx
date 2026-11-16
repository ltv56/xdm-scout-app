import { useQuery } from '@tanstack/react-query'
import type { ActivityRow } from '../../../api/src/activity/contract'
import { getJson } from '../api'
import EmptyState from '../ui/EmptyState'
import { btnSecondary } from '../ui/ui'

const WHAT: Record<ActivityRow['kind'], string> = {
  dnc_added: 'Put on Do not contact',
  dnc_removed: 'Taken off Do not contact',
  known_added: 'Added to Known to the fund',
  cap_changed: 'Daily send cap changed',
  known_removed: 'Removed from Known to the fund',
  owner_set_up: 'Server set up by its owner',
  signed_in: 'Signed in',
  sign_in_failed: 'Wrong password',
  signed_out_everywhere: 'Signed out everywhere',
  keys_changed: 'Keys changed',
  keys_forgotten: 'Keys and X tokens removed',
  handed_over: 'Server handed over to a new owner',
}

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

// Changes to who may be contacted (with the reason), sign-ins and key changes, newest first.
export default function Activity() {
  const rows = useQuery<ActivityRow[]>({ queryKey: ['activity'], queryFn: () => getJson('/activity'), retry: false })
  const list = rows.data ?? []

  if (!rows.error && !list.length) return <EmptyState title="No activity yet" text="Changes to who may be contacted are logged here, with the reason, as are sign-ins and key changes." />

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
