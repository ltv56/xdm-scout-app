import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SenderProfile } from '../../../api/src/review/contract'
import { getJson, patchJson } from '../api'
import Select from '../ui/Select'
import TagInput from '../ui/TagInput'
import SourceFields from './SourceFields'
import ReadLimits from './ReadLimits'
import { readLimitsProblem } from './read-limits'
import { useFeatures } from '../useFeatures'
import { btnPrimary, field as baseField } from '../ui/ui'

const field = `${baseField} mt-1`

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)
const isPostLink = (s: string) => /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{10,20}([/?#].*)?$/.test(s.trim())

interface CampaignRow {
  id: number
  name: string
  keywords: string[]
  handles: string[]
  seeds: string[] | null
  followersOf: string[] | null
  queries: string[] | null
  criteria: string[] | null
  regions: string[] | null
  budgetMicros: number
  searchMax: number
  followingMax: number
  followersMax: number
  programId: number | null
  callPostUrl: string | null
  callKeyword: string | null
}

const text = (items: string[] | null) => (items ?? []).join('\n')
const list = (items: string[] | null) => items ?? []
const snapshot = (r: CampaignRow) =>
  JSON.stringify([r.name, r.keywords, list(r.handles), list(r.seeds), list(r.followersOf), list(r.queries), list(r.regions), text(r.criteria), String(r.budgetMicros / 1_000_000), r.programId, r.callPostUrl ?? '', r.callKeyword ?? '', String(r.searchMax), String(r.followingMax), String(r.followersMax)])

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
  const { callPost } = useFeatures()
  const [name, setName] = useState(row.name)
  const [keywords, setKeywords] = useState(list(row.keywords))
  const [handles, setHandles] = useState(list(row.handles))
  const [seeds, setSeeds] = useState(list(row.seeds))
  const [followersOf, setFollowersOf] = useState(list(row.followersOf))
  const [queries, setQueries] = useState(list(row.queries))
  const [criteria, setCriteria] = useState(text(row.criteria))
  const [regions, setRegions] = useState(list(row.regions))
  const [budget, setBudget] = useState(String(row.budgetMicros / 1_000_000))
  const [searchMax, setSearchMax] = useState(String(row.searchMax))
  const [followingMax, setFollowingMax] = useState(String(row.followingMax))
  const [followersMax, setFollowersMax] = useState(String(row.followersMax))
  const [programId, setProgramId] = useState<number | null>(row.programId)
  const [callUrl, setCallUrl] = useState(row.callPostUrl ?? '')
  const [callKeyword, setCallKeyword] = useState(row.callKeyword ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(() => snapshot(row))
  // Text typed in a tag box is added on Save, so typing alone counts as a change.
  const [typed, setTyped] = useState(false)
  const current = JSON.stringify([name, keywords, handles, seeds, followersOf, queries, regions, criteria, budget, programId, callUrl, callKeyword, searchMax, followingMax, followersMax])
  const dirty = typed || current !== saved

  const profile = useQuery<SenderProfile>({ queryKey: ['sender-profile'], queryFn: () => getJson('/sender-profile'), retry: false })
  const programs = profile.data?.programs ?? []

  const save = useMutation({
    mutationFn: (body: unknown) => patchJson<CampaignRow>(`/campaigns/${row.id}`, body),
    onSuccess: (saved) => {
      setName(saved.name)
      setKeywords(list(saved.keywords))
      setHandles(list(saved.handles))
      setSeeds(list(saved.seeds))
      setFollowersOf(list(saved.followersOf))
      setQueries(list(saved.queries))
      setCriteria(text(saved.criteria))
      setRegions(list(saved.regions))
      setBudget(String(saved.budgetMicros / 1_000_000))
      setSearchMax(String(saved.searchMax))
      setFollowingMax(String(saved.followingMax))
      setFollowersMax(String(saved.followersMax))
      setProgramId(saved.programId)
      setCallUrl(saved.callPostUrl ?? '')
      setCallKeyword(saved.callKeyword ?? '')
      setSaved(snapshot(saved))
      setTyped(false)
      return Promise.all(['campaign', 'campaigns', 'estimate'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
    },
  })

  const submit = () => {
    const budgetUsd = Number(budget)
    const gap = !name.trim()
      ? 'Give the campaign a name.'
      : !keywords.length
        ? 'Add at least one keyword.'
        : !handles.length && !seeds.length && !followersOf.length && !queries.length
          ? 'Add at least one handle, seed account or search query.'
          : !budget.trim() || !(budgetUsd > 0 && budgetUsd <= 100)
            ? 'Budget must be above 0 and at most 100 USD.'
            : readLimitsProblem(searchMax, followingMax, followersMax)
              ? readLimitsProblem(searchMax, followingMax, followersMax)
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
      followersOf,
      queries,
      criteria: lines(criteria),
      regions,
      budgetUsd,
      searchMax: Number(searchMax),
      followingMax: Number(followingMax),
      followersMax: Number(followersMax),
      programId,
      callPostUrl: callUrl.trim() || null,
      callKeyword: callKeyword.trim() || null,
    })
  }

  return (
    <form
      noValidate
      className="mt-4 space-y-6"
      onInput={() => setTyped(true)}
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
        <p className="mt-1 text-xs text-muted">Topics the people you want to reach write about.</p>
      </div>

      <fieldset className="space-y-5">
        <legend className="text-sm font-medium">Where to find people (at least one)</legend>
        <SourceFields handles={handles} seeds={seeds} followersOf={followersOf} queries={queries} onHandles={setHandles} onSeeds={setSeeds} onFollowersOf={setFollowersOf} onQueries={setQueries} regions={regions} onRegions={setRegions} />
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

      {callPost && (
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
      )}

      <div>
        <label htmlFor="campaign-budget" className="text-sm font-medium">
          Discovery budget in USD
        </label>
        <input id="campaign-budget" type="number" inputMode="decimal" min="0" max="100" step="any" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${field} max-w-40`} />
        <p className="mt-1 text-xs text-muted">Discovery stops when X usage reaches this amount.</p>
      </div>

      <ReadLimits id="campaign" searchMax={searchMax} followingMax={followingMax} onSearchMax={setSearchMax} onFollowingMax={setFollowingMax} followersMax={followersMax} onFollowersMax={setFollowersMax} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={save.isPending || !dirty} className={btnPrimary}>
          Save campaign
        </button>
        {save.isSuccess && !dirty && (
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
