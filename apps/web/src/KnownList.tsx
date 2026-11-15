import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ImportResult, KnownPerson } from '../../api/src/known/contract'
import { getJson, postJson } from './api'
import { btnPrimary, btnSecondary, field } from './ui'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function summary(r: ImportResult) {
  const parts = [`Added ${plural(r.added, 'person', 'people')}`]
  if (r.alreadyKnown) parts.push(`${r.alreadyKnown} already on the list`)
  if (r.notFound.length) parts.push(`not found on X: ${r.notFound.map((h) => `@${h}`).join(', ')}`)
  if (r.invalid.length) parts.push(`not a handle, skipped: ${r.invalid.join(', ')}`)
  return `${parts.join('. ')}.`
}

export default function KnownList() {
  const qc = useQueryClient()
  const [listName, setListName] = useState('')
  const [handles, setHandles] = useState('')
  const [warm, setWarm] = useState(false)
  const [event, setEvent] = useState('')
  const list = useQuery<KnownPerson[]>({ queryKey: ['known-users'], queryFn: () => getJson('/known-users'), retry: false })
  const done = () => qc.invalidateQueries({ queryKey: ['known-users'] })
  const add = useMutation({
    mutationFn: () => postJson<ImportResult>('/known-users/import', { listName, handles, ...(warm && { kind: 'warm', event }) }),
    onSuccess: () => {
      setHandles('')
      void done()
    },
  })
  const remove = useMutation({ mutationFn: (id: string) => fetch(`/api/known-users/${id}`, { method: 'DELETE' }).then(done) })

  return (
    <section aria-label="Known to the fund" className="max-w-xl">
      <h3 className="text-xl font-bold">Known to the fund</h3>
      <p className="mt-1 text-sm text-muted">People you already know, such as your portfolio or people in talks. Searches skip them and no draft is written. People who know the fund already stay as candidates with a label. You can take anyone off again.</p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <div>
          <label htmlFor="known-name" className="block text-sm font-medium">
            List name
          </label>
          <input id="known-name" className={field} value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Portfolio" />
        </div>
        <div>
          <label htmlFor="known-handles" className="block text-sm font-medium">
            Handles, one per line or a CSV with the handle in the first column
          </label>
          <textarea id="known-handles" className={`${field} h-28`} value={handles} onChange={(e) => setHandles(e.target.value)} />
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label="Load a CSV file"
            className="mt-1 text-xs"
            onChange={(e) => void e.target.files?.[0]?.text().then(setHandles)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={warm} onChange={(e) => setWarm(e.target.checked)} />
          They know us already: keep them as candidates and say why
        </label>
        {warm && (
          <div>
            <label htmlFor="known-event" className="block text-sm font-medium">
              How they know us
            </label>
            <input id="known-event" className={field} value={event} onChange={(e) => setEvent(e.target.value)} placeholder="Met at Build Week" />
          </div>
        )}
        {add.error && (
          <p role="alert" className="text-sm font-medium text-block">
            {add.error.message}
          </p>
        )}
        {add.data && <p className="text-sm text-muted">{summary(add.data)}</p>}
        <button type="submit" className={btnPrimary} disabled={add.isPending}>
          Add to the list
        </button>
      </form>

      {list.error && (
        <p role="alert" className="mt-4 text-sm text-block">
          Could not load the list: {list.error.message}
        </p>
      )}
      {!!list.data?.length && (
        <ul className="mt-4 divide-y divide-rule rounded-2xl border border-rule bg-paper">
          {list.data.map((p) => (
            <li key={p.xUserId} className="flex items-center justify-between gap-4 px-5 py-3">
              <p className="text-sm">
                <span className="font-semibold">@{p.handle}</span> <span className="text-muted">
                  · {p.listName}
                  {p.kind === 'warm' && ' (warm)'}
                </span>
              </p>
              <button type="button" className={btnSecondary} disabled={remove.isPending} onClick={() => remove.mutate(p.xUserId)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
