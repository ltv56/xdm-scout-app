import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ProfileLink } from './XLink'
import { useState } from 'react'
import type { DncPerson } from '../../api/src/dnc/contract'
import { getJson, postJson } from './api'
import { btnPrimary, btnSecondary, field } from './ui'

const SOURCE: Record<string, string> = { operator: 'You marked them', csv: 'Imported list' }

function Row({ p }: { p: DncPerson }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const remove = useMutation({
    mutationFn: () => postJson(`/do-not-contact/${p.xUserId}/remove`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['do-not-contact'] }),
  })

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <ProfileLink handle={p.handle} className="text-sm font-semibold">
            @{p.handle}
          </ProfileLink>
          <p className="text-sm text-muted">
            {p.reason} · {SOURCE[p.source] ?? p.source} · {new Date(p.since).toLocaleDateString()}
          </p>
        </div>
        {!open && (
          <button type="button" className={btnSecondary} onClick={() => setOpen(true)}>
            Remove
          </button>
        )}
      </div>
      {open && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            remove.mutate()
          }}
        >
          <label className="block text-sm font-medium" htmlFor={`why-${p.xUserId}`}>
            Why can @{p.handle} be contacted again?
          </label>
          <input id={`why-${p.xUserId}`} className={field} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          {remove.error && (
            <p role="alert" className="text-sm font-medium text-block">
              {remove.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={remove.isPending}>
              Remove from the list
            </button>
            <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

export default function DoNotContactList() {
  const list = useQuery<DncPerson[]>({ queryKey: ['do-not-contact'], queryFn: () => getJson('/do-not-contact'), retry: false })

  return (
    <section aria-label="Do not contact" className="max-w-xl">
      <h3 className="text-xl font-bold">Do not contact</h3>
      <p className="mt-1 text-sm text-muted">Nobody here is drafted or messaged, in any campaign. Removing someone needs a reason, and the reason is logged.</p>
      {list.error && (
        <p role="alert" className="mt-4 text-sm text-block">
          Could not load the list: {list.error.message}
        </p>
      )}
      {list.data && list.data.length === 0 && <p className="mt-4 text-sm text-muted">Nobody yet.</p>}
      {!!list.data?.length && <ul className="mt-4 divide-y divide-rule rounded-2xl border border-rule bg-paper">{list.data.map((p) => <Row key={p.xUserId} p={p} />)}</ul>}
    </section>
  )
}
