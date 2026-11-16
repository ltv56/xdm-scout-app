import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { KeyName, KeysPage, KeyView } from '../../../api/src/keys/contract'
import { getJson, postJson, putJson } from '../api'
import { btnLink, btnPrimary, btnSecondary, field } from '../ui/ui'

const FIELDS: { name: KeyName; label: string; hint: string }[] = [
  { name: 'xClientId', label: 'X client ID', hint: 'X developer portal > your app > Keys and tokens > OAuth 2.0 Client ID.' },
  { name: 'xClientSecret', label: 'X client secret', hint: 'Same page, OAuth 2.0 Client Secret.' },
  { name: 'openaiApiKey', label: 'OpenAI API key', hint: 'platform.openai.com > API keys. A project key with a spend limit is safest.' },
]
const SCOPES = 'dm.read dm.write tweet.read users.read follows.read offline.access'

const status = (k: KeyView) => (!k.set ? 'Not set' : `${k.source === 'saved' ? 'Saved' : 'From the server .env'}, ends in ${k.last4}`)

// The owner's own X app and OpenAI key. Keys are sent once, stored encrypted and never shown again; only the last 4 characters come back.
export default function KeysSection({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient()
  const page = useQuery<KeysPage>({ queryKey: ['keys'], queryFn: () => getJson('/keys'), retry: false })
  const [draft, setDraft] = useState<Partial<Record<KeyName, string>>>({})
  const [confirmForget, setConfirmForget] = useState(false)
  const done = (fresh: KeysPage) => {
    qc.setQueryData(['keys'], fresh)
    setDraft({})
    return Promise.all(['x-status', 'preflight'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
  }
  const save = useMutation({ mutationFn: (body: Partial<Record<KeyName, string>>) => putJson<KeysPage>('/keys', body), onSuccess: done })
  const forget = useMutation({ mutationFn: () => postJson<KeysPage>('/keys/forget'), onSuccess: (fresh) => (setConfirmForget(false), done(fresh)) })
  const typed = Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.trim())) as Partial<Record<KeyName, string>>

  if (page.isLoading) return <p role="status" className="text-sm text-muted">Loading keys…</p>
  if (page.error || !page.data) return <p role="alert" className="text-sm text-block">{page.error?.message ?? 'Keys not available'}</p>
  const { keys, callbackUrl, canSave } = page.data

  return (
    <section aria-label="Keys" className="max-w-xl">
      {!compact && (
        <>
          <h3 className="text-xl font-bold">Keys</h3>
          <p className="mt-1 text-sm text-muted">Your own X app and OpenAI key. They are stored encrypted on this server and never shown again: only the last 4 characters. Every change is in the Activity log.</p>
        </>
      )}
      <div className="mt-4 rounded-2xl border border-rule bg-paper px-5 py-4 text-sm">
        <p className="font-medium">In your X app (developer.x.com) set:</p>
        <p className="mt-2 text-muted">Callback URL</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-rail px-3 py-1.5 text-xs">{callbackUrl}</code>
          <button type="button" className={btnLink} onClick={() => void navigator.clipboard?.writeText(callbackUrl)}>
            Copy
          </button>
        </div>
        <p className="mt-2 text-muted">
          App permissions: Read and write and Direct message. Type: Web App. Scopes asked: <code className="text-xs">{SCOPES}</code>
        </p>
      </div>

      {!canSave && (
        <p role="alert" className="mt-4 text-sm font-medium text-block">
          This server has no TOKEN_KEY, so keys cannot be stored encrypted. Set it in the server .env and restart.
        </p>
      )}

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(typed)
        }}
      >
        {FIELDS.map((f) => (
          <div key={f.name}>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={`key-${f.name}`} className="text-sm font-medium">
                {f.label}
              </label>
              <span className="text-xs text-muted">
                {status(keys[f.name])}
                {keys[f.name].source === 'saved' && (
                  <button type="button" className={`${btnLink} ml-3 text-xs`} disabled={save.isPending} onClick={() => save.mutate({ [f.name]: '' })}>
                    Clear
                  </button>
                )}
              </span>
            </div>
            <input
              id={`key-${f.name}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={`${field} mt-1`}
              placeholder={keys[f.name].set ? 'Type a new value to replace it' : ''}
              value={draft[f.name] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
            />
            <p className="mt-1 text-xs text-muted">{f.hint}</p>
          </div>
        ))}
        {save.error && (
          <p role="alert" className="text-sm font-medium text-block">
            {save.error.message}
          </p>
        )}
        {save.isSuccess && !Object.keys(typed).length && <p role="status" className="text-sm text-muted">Saved.</p>}
        <button type="submit" className={btnPrimary} disabled={!canSave || save.isPending || !Object.keys(typed).length}>
          {save.isPending ? 'Saving…' : 'Save keys'}
        </button>
      </form>

      {!compact && (
        <div className="mt-10 border-t border-rule pt-6">
          <h4 className="text-sm font-semibold">When you are done</h4>
          <p className="mt-1 text-sm text-muted">Removes the saved keys and the X account&apos;s tokens from this server. Revoke the app on X and the OpenAI key too.</p>
          {confirmForget ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className={btnPrimary} disabled={forget.isPending} onClick={() => forget.mutate()}>
                Yes, forget everything
              </button>
              <button type="button" className={btnSecondary} onClick={() => setConfirmForget(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className={`${btnSecondary} mt-3`} onClick={() => setConfirmForget(true)}>
              Forget keys and X account
            </button>
          )}
          {forget.error && <p role="alert" className="mt-2 text-sm text-block">{forget.error.message}</p>}
        </div>
      )}
    </section>
  )
}
