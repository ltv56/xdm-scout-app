import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getJson, putJson } from '../api'
import { btnPrimary, field } from '../ui/ui'

interface SendSettings {
  dailyCap: number
  sentToday: number
}

export default function DailyCap() {
  const qc = useQueryClient()
  const settings = useQuery<SendSettings>({ queryKey: ['send-settings'], queryFn: () => getJson('/send-settings'), retry: false })
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? String(settings.data?.dailyCap ?? '')
  const save = useMutation({
    mutationFn: () => putJson<SendSettings>('/send-settings', { dailyCap: Number(value) }),
    onSuccess: async () => {
      setDraft(null)
      await Promise.all([qc.invalidateQueries({ queryKey: ['send-settings'] }), qc.invalidateQueries({ queryKey: ['top-bar'] }), qc.invalidateQueries({ queryKey: ['activity'] })])
    },
  })
  const invalid = value.trim() === '' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 500

  return (
    <section aria-label="Daily send cap" className="max-w-xl">
      <h3 className="text-xl font-bold">Daily send cap</h3>
      <p className="mt-1 text-sm text-muted">The most messages sent through the API in one day (UTC). At the cap, sending stops until tomorrow; 0 stops it altogether.</p>
      {settings.error && (
        <p role="alert" className="mt-4 text-sm text-block">
          Could not load the cap: {settings.error.message}
        </p>
      )}
      {settings.data && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <label className="text-sm font-medium" htmlFor="daily-cap">
            Messages per day (0 to 500)
            <input id="daily-cap" inputMode="numeric" className={`${field} mt-1 w-32`} value={value} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button type="submit" className={btnPrimary} disabled={save.isPending || invalid || draft === null || Number(value) === settings.data.dailyCap}>
            Save
          </button>
          <p className="basis-full text-sm text-muted">Sent today: {settings.data.sentToday}</p>
        </form>
      )}
      {save.error && (
        <p role="alert" className="mt-2 text-sm font-medium text-block">
          {save.error.message}
        </p>
      )}
      {save.isSuccess && draft === null && (
        <p role="status" className="mt-2 text-sm text-muted">
          Saved.
        </p>
      )}
    </section>
  )
}
