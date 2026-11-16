import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SenderProfile } from '../../api/src/review/contract'
import { getJson, patchJson } from './api'
import Select from './Select'
import TagInput from './TagInput'
import { btnPrimary, field as baseField } from './ui'

const field = `${baseField} mt-1`

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)
const handle = (item: string) => item.replace(/^@/, '').toLowerCase()
const isPostLink = (s: string) => /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{10,20}([/?#].*)?$/.test(s.trim())

interface CampaignRow {
  id: number
  name: string
  keywords: string[]
  handles: string[]
  seeds: string[] | null
  queries: string[] | null
  criteria: string[] | null
  budgetMicros: number
  programId: number | null
  callPostUrl: string | null
  callKeyword: string | null
}

const text = (items: string[] | null) => (items ?? []).join('\n')
const list = (items: string[] | null) => items ?? []

export default function CampaignSettings({ campaignId }: { campaignId: number }) {
  const campaign = useQuery<CampaignRow>({ queryKey: ['campaign', campaignId], queryFn: () => getJson(`/campaigns/${campaignId}`), retry: false })
  return (
    <section aria-label="Campaign" className="max-w-3xl">
      <h3 className="text-xl font-bold">Campaign</h3>
      <p className="mt-1 text-sm text-muted">What a search for this campaign looks for. Changes apply the next time you press Search again. People already found, drafts and sent messages stay as they are.</p>
      {campaign.error && (
        <p role="alert" className="mt-4 text-sm text-block">
          Could not load the campaign: {campaign.error.message}
        </p>
      )}
      {campaign.data && <CampaignForm key={campaignId} row={campaign.data} />}
    </section>
  )
}

function CampaignForm({ row }: { row: CampaignRow }) {
  const qc = useQueryClient()
  const [name, setName] = useState(row.name)
  const [keywords, setKeywords] = useState(list(row.keywords))
  const [handles, setHandles] = useState(list(row.handles))
  const [seeds, setSeeds] = useState(list(row.seeds))
  const [queries, setQueries] = useState(list(row.queries))
  const [criteria, setCriteria] = useState(text(row.criteria))
  const [budget, setBudget] = useState(String(row.budgetMicros / 1_000_000))
  const [programId, setProgramId] = useState<number | null>(row.programId)
  const [callUrl, setCallUrl] = useState(row.callPostUrl ?? '')
  const [callKeyword, setCallKeyword] = useState(row.callKeyword ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const profile = useQuery<SenderProfile>({ queryKey: ['sender-profile'], queryFn: () => getJson('/sender-profile'), retry: false })
  const programs = profile.data?.programs ?? []

  const save = useMutation({
    mutationFn: (body: unknown) => patchJson<CampaignRow>(`/campaigns/${row.id}`, body),
    onSuccess: (saved) => {
      setName(saved.name)
      setKeywords(list(saved.keywords))
      setHandles(list(saved.handles))
      setSeeds(list(saved.seeds))
      setQueries(list(saved.queries))
      setCriteria(text(saved.criteria))
      setBudget(String(saved.budgetMicros / 1_000_000))
      return Promise.all(['campaign', 'campaigns', 'estimate'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
    },
  })

  const submit = () => {
    const budgetUsd = Number(budget)
    const gap = !name.trim()
      ? 'Give the campaign a name.'
      : !keywords.length
        ? 'Add at least one keyword.'
        : !handles.length && !seeds.length && !queries.length
          ? 'Add at least one handle, seed account or search query.'
          : !budget.trim() || !(budgetUsd > 0 && budgetUsd <= 100)
            ? 'Budget must be above 0 and at most 100 USD.'
            : !!callUrl.trim() !== !!callKeyword.trim()
              ? 'Give both the call post and the keyword, or neither.'
              : callUrl.trim() && !isPostLink(callUrl)
                ? 'The call post must be the link of a post on X, like https://x.com/yourfund/status/123…'
                : null
    setProblem(gap)
    save.reset()
    if (gap) return
    save.mutate({
      name: name.trim(),
      keywords,
      handles,
      seeds,
      queries,
      criteria: lines(criteria),
      budgetUsd,
      programId,
      callPostUrl: callUrl.trim() || null,
      callKeyword: callKeyword.trim() || null,
    })
  }

  return (
    <form
      noValidate
      className="mt-4 space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div>
        <label htmlFor="campaign-name" className="text-sm font-medium">
          Name
        </label>
        <input id="campaign-name" value={name} maxLength={128} onChange={(e) => setName(e.target.value)} className={field} />
      </div>

      <div>
        <TagInput label="Keywords" value={keywords} onChange={setKeywords} placeholder="Type a keyword, press Enter" />
        <p className="mt-1 text-xs text-muted">Topics the people you want write about.</p>
      </div>

      <fieldset className="space-y-5">
        <legend className="text-sm font-medium">Where to find people (at least one)</legend>
        <div>
          <TagInput label="Handles" value={handles} onChange={setHandles} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
          <p className="mt-1 text-xs text-muted">With or without @.</p>
        </div>
        <div>
          <TagInput label="Seed accounts" value={seeds} onChange={setSeeds} max={10} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
          <p className="mt-1 text-xs text-muted">People they follow are added as prospects. Up to 10.</p>
        </div>
        <div>
          <TagInput label="Search queries" value={queries} onChange={setQueries} max={10} placeholder="Type a query, press Enter" labelClassName="text-sm text-muted" />
          <p className="mt-1 text-xs text-muted">Recent-post searches on X. Up to 10.</p>
        </div>
      </fieldset>

      <div>
        <label htmlFor="campaign-criteria" className="text-sm font-medium">
          Fund criteria (optional)
        </label>
        <textarea id="campaign-criteria" rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} className={field} />
        <p className="mt-1 text-xs text-muted">One per line, up to 5. Write each one so that met is good: “Pre-Series A, no $100M+ fund yet”.</p>
      </div>

      <div>
        <label htmlFor="campaign-program" className="text-sm font-medium">
          Program to offer
        </label>
        {programs.length > 0 ? (
          <Select id="campaign-program" value={programId ?? ''} onChange={(e) => setProgramId(e.target.value ? Number(e.target.value) : null)} wrapperClassName="block w-full">
            {programId === null && <option value="">No program</option>}
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="mt-1 text-sm text-muted">{profile.isLoading ? 'Loading…' : 'Add a program in Account first. Drafts can only offer a program from your sender profile.'}</p>
        )}
      </div>

      <div>
        <label htmlFor="campaign-call-url" className="text-sm font-medium">
          Link of the call post (optional)
        </label>
        <input id="campaign-call-url" type="url" inputMode="url" value={callUrl} onChange={(e) => setCallUrl(e.target.value)} className={field} />
        <label htmlFor="campaign-call-keyword" className="mt-3 block text-sm text-muted">
          Keyword people DM
        </label>
        <input id="campaign-call-keyword" value={callKeyword} maxLength={40} onChange={(e) => setCallKeyword(e.target.value)} className={`${field} max-w-60`} />
      </div>

      <div>
        <label htmlFor="campaign-budget" className="text-sm font-medium">
          Discovery budget in USD
        </label>
        <input id="campaign-budget" type="number" inputMode="decimal" min="0" max="100" step="any" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${field} max-w-40`} />
        <p className="mt-1 text-xs text-muted">Discovery stops when X usage reaches this amount.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={save.isPending} className={btnPrimary}>
          Save campaign
        </button>
        {save.isSuccess && (
          <span role="status" className="text-sm text-muted">
            Saved. Press Search again on the Overview to use it.
          </span>
        )}
      </div>
      {(problem ?? save.error?.message) && (
        <p role="alert" className="text-sm font-medium text-block">
          {problem ?? save.error?.message}
        </p>
      )}
    </form>
  )
}
