import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SenderProfile } from '../../api/src/review/contract'
import { type XStatus } from './Account'
import { getJson, postJson } from './api'
import Select from './Select'
import TagInput from './TagInput'
import { btnPrimary, btnSecondary, field as baseField } from './ui'

const field = `${baseField} mt-1`

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
const handle = (item: string) => item.replace(/^@/, '').toLowerCase()
const isPostLink = (s: string) => /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{10,20}([/?#].*)?$/.test(s.trim())

interface Props {
  first: boolean
  // Fills the page instead of a narrow column; the first run uses it.
  wide?: boolean
  onCreated: (id: number) => void
  onCancel: () => void
}

const DEFAULT_NAME = 'AI and robotics builders'
const DEFAULT_KEYWORDS = ['robotics', 'embodied AI', 'LLM', 'AI agents', 'developer tools', 'AI infrastructure']
// The people the fake X knows. Used only in the sandbox, so the first search has someone to find.
const SANDBOX_HANDLES = ['mina_builds', 'tomas_agents', 'lena_embodied', 'robotco', 'private_dev', 'pasta_daily', 'nobody_here']

const Star = () => (
  <span aria-hidden className="ml-0.5 text-block">
    *
  </span>
)

export default function NewCampaign({ first, wide = false, onCreated, onCancel }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState(first ? DEFAULT_NAME : '')
  const [keywords, setKeywords] = useState<string[]>(first ? DEFAULT_KEYWORDS : [])
  const [handleText, setHandleText] = useState<string[]>([])
  const [seeds, setSeeds] = useState<string[]>([])
  const [queries, setQueries] = useState<string[]>([])
  const [criteria, setCriteria] = useState('')
  const [budget, setBudget] = useState('')
  const [programId, setProgramId] = useState<number | null>(null)
  const [callUrl, setCallUrl] = useState('')
  const [callKeyword, setCallKeyword] = useState('')
  const [missing, setMissing] = useState<string | null>(null)

  const sandbox =
    useQuery<XStatus>({
      queryKey: ['x-status'],
      queryFn: () => getJson('/auth/x/status'),
    }).data?.mode !== 'live'
  const profile = useQuery<SenderProfile>({
    queryKey: ['sender-profile'],
    queryFn: () => getJson('/sender-profile'),
    retry: false,
  })
  const programs = profile.data?.programs ?? []
  const chosen = programId ?? programs[0]?.id ?? null

  const create = useMutation({
    mutationFn: async (campaign: unknown) => {
      const { id } = await postJson<{ id: number }>('/campaigns', campaign)
      await qc.invalidateQueries({ queryKey: ['campaigns'] })
      return id
    },
    onSuccess: (id) => onCreated(id),
  })

  const untouched = !handleText.length && !seeds.length && !queries.length
  const handleList = first && untouched && sandbox ? SANDBOX_HANDLES : handleText
  const queryList = first && untouched && !sandbox ? keywords.slice(0, 10) : queries

  const submit = () => {
    const budgetUsd = budget.trim() ? Number(budget) : undefined
    const gap = !name.trim()
      ? 'Give the campaign a name.'
      : !keywords.length
        ? 'Add at least one keyword.'
        : !handleList.length && !seeds.length && !queryList.length
          ? 'Add at least one handle, seed account or search query.'
          : budgetUsd !== undefined && !(budgetUsd > 0 && budgetUsd <= 100)
            ? 'Budget must be above 0 and at most 100 USD.'
            : programs.length > 0 && chosen === null
              ? 'Pick the program this campaign offers.'
              : !!callUrl.trim() !== !!callKeyword.trim()
                ? 'Give both the call post and the keyword, or neither.'
                : callUrl.trim() && !isPostLink(callUrl)
                  ? 'The call post must be the link of a post on X, like https://x.com/yourfund/status/123…'
                  : null
    setMissing(gap)
    create.reset()
    if (gap) return
    create.mutate({
      name: name.trim(),
      keywords,
      handles: handleList,
      seeds,
      queries: queryList,
      criteria: lines(criteria),
      ...(budgetUsd !== undefined && { budgetUsd }),
      programId: chosen,
      callPostUrl: callUrl.trim() || null,
      callKeyword: callKeyword.trim() || null,
    })
  }

  return (
    <form
      noValidate
      className={wide ? 'space-y-6' : 'max-w-xl space-y-6'}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div>
        <h2 className="text-2xl font-bold">{first ? 'Start your first campaign' : 'New campaign'}</h2>
        <p className="mt-1 text-sm text-muted">{first ? 'A campaign is one search for people to message. Say who to look for, then press Run first search on the Overview.' : 'Tell us who to look at, then run discovery from the Overview.'}</p>
      </div>

      <div>
        <label htmlFor="name" className="text-sm font-medium">
          Name{first && <Star />}
        </label>
        <input id="name" value={name} maxLength={128} onChange={(e) => setName(e.target.value)} className={field} />
      </div>

      <div>
        <TagInput label="Keywords" labelSuffix={first && <Star />} value={keywords} onChange={setKeywords} placeholder="Type a keyword, press Enter" />
        <p className="mt-1 text-xs text-muted">
          Topics the people you want write about.
          {first && ' Pre-filled for AI and robotics builders; change them for another audience.'}
        </p>
      </div>

      {first ? (
        <>
          {programs.length > 1 ? (
            <div>
              <label htmlFor="program" className="text-sm font-medium">
                Program to offer
              </label>
              {programs.length > 0 ? (
                <Select id="program" value={chosen ?? ''} onChange={(e) => setProgramId(Number(e.target.value))} wrapperClassName="block w-full">
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.deadline ? `, applications close ${new Date(p.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="mt-1 text-sm text-muted">{profile.isLoading ? 'Loading…' : 'Add a program in Account first. Drafts can only offer a program from your sender profile.'}</p>
              )}
              <p className="mt-1 text-xs text-muted">Every draft in this campaign offers this program, with its link and deadline.</p>
            </div>
          ) : (
            programs[0] && <p className="text-sm text-muted">This campaign offers {programs[0].name}.</p>
          )}
          <details className="rounded-2xl border border-rule px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium">
              More options <span className="font-normal text-muted">(who to look at, fund criteria, a call post, a budget)</span>
            </summary>
            <div className="mt-5 space-y-6">
              <div>
                <TagInput label="Handles" value={handleText} onChange={setHandleText} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
                <p className="mt-1 text-xs text-muted">With or without @. Left empty here and in the next two boxes: {sandbox ? 'the example people are used.' : 'the app searches X for your keywords.'}</p>
              </div>
              <div>
                <TagInput label="Seed accounts" value={seeds} onChange={setSeeds} max={10} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
                <p className="mt-1 text-xs text-muted">People they follow are added as prospects. Up to 10.</p>
              </div>
              <div>
                <TagInput label="Search queries" value={queries} onChange={setQueries} max={10} placeholder="Type a query, press Enter" labelClassName="text-sm text-muted" />
                <p className="mt-1 text-xs text-muted">Recent-post searches on X. Up to 10.</p>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Fund criteria (optional)</summary>
                <textarea aria-label="Fund criteria" placeholder={'Based in or building for Southeast Asia\nPre-Series A, no $100M+ fund yet'} rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} className={field} />
                <p className="mt-1 text-xs text-muted">One per line, up to 5. Each is checked against the person's posts and shown on their Fit card. Write each one so that met is good: “Pre-Series A, no $100M+ fund yet”, not “Has not raised a big round”.</p>
              </details>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Call post (optional)</summary>
                <p className="mt-2 text-xs text-muted">
                  Post it on X yourself, for example “Building agents in SEA? DM us ‘build’ for an Agentic AI Build Week invite.” xdm-scout does not post. People who DM you after it are added to this campaign, and you can reply to them from here.
                </p>
                <label htmlFor="call-url" className="mt-3 block text-sm text-muted">
                  Link of the post
                </label>
                <input id="call-url" type="url" inputMode="url" value={callUrl} onChange={(e) => setCallUrl(e.target.value)} className={field} />
                <label htmlFor="call-keyword" className="mt-3 block text-sm text-muted">
                  Keyword people DM
                </label>
                <input id="call-keyword" value={callKeyword} maxLength={40} onChange={(e) => setCallKeyword(e.target.value)} className={`${field} max-w-60`} />
                <p className="mt-1 text-xs text-muted">We read when the post went up from its link, so only DMs sent after it count.</p>
              </details>
              <div>
                <label htmlFor="budget" className="text-sm font-medium">
                  Discovery budget in USD (optional)
                </label>
                <input id="budget" type="number" inputMode="decimal" min="0" max="100" step="any" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${field} max-w-40`} />
                <p className="mt-1 text-xs text-muted">Discovery stops when X usage reaches this amount.</p>
              </div>
            </div>
            <p className="mt-5 text-xs text-muted">All of these are also in New campaign.</p>
          </details>
        </>
      ) : (
        <>
          <fieldset className="space-y-5">
            <legend className="text-sm font-medium">Where to find people (at least one)</legend>
            <div>
              <TagInput label="Handles" value={handleText} onChange={setHandleText} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
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

          <details>
            <summary className="cursor-pointer text-sm font-medium">Fund criteria (optional)</summary>
            <textarea aria-label="Fund criteria" placeholder={'Based in or building for Southeast Asia\nPre-Series A, no $100M+ fund yet'} rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} className={field} />
            <p className="mt-1 text-xs text-muted">One per line, up to 5. Each is checked against the person's posts and shown on their Fit card. Write each one so that met is good: “Pre-Series A, no $100M+ fund yet”, not “Has not raised a big round”.</p>
          </details>

          <div>
            <label htmlFor="program" className="text-sm font-medium">
              Program to offer
            </label>
            {programs.length > 0 ? (
              <Select id="program" value={chosen ?? ''} onChange={(e) => setProgramId(Number(e.target.value))} wrapperClassName="block w-full">
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.deadline ? `, applications close ${new Date(p.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="mt-1 text-sm text-muted">{profile.isLoading ? 'Loading…' : 'Add a program in Account first. Drafts can only offer a program from your sender profile.'}</p>
            )}
            <p className="mt-1 text-xs text-muted">Every draft in this campaign offers this program, with its link and deadline.</p>
          </div>

          <details>
            <summary className="cursor-pointer text-sm font-medium">Call post (optional)</summary>
            <p className="mt-2 text-xs text-muted">
              Post it on X yourself, for example “Building agents in SEA? DM us ‘build’ for an Agentic AI Build Week invite.” xdm-scout does not post. People who DM you after it are added to this campaign, and you can reply to them from here.
            </p>
            <label htmlFor="call-url" className="mt-3 block text-sm text-muted">
              Link of the post
            </label>
            <input id="call-url" type="url" inputMode="url" value={callUrl} onChange={(e) => setCallUrl(e.target.value)} className={field} />
            <label htmlFor="call-keyword" className="mt-3 block text-sm text-muted">
              Keyword people DM
            </label>
            <input id="call-keyword" value={callKeyword} maxLength={40} onChange={(e) => setCallKeyword(e.target.value)} className={`${field} max-w-60`} />
            <p className="mt-1 text-xs text-muted">We read when the post went up from its link, so only DMs sent after it count.</p>
          </details>

          <div>
            <label htmlFor="budget" className="text-sm font-medium">
              Discovery budget in USD (optional)
            </label>
            <input id="budget" type="number" inputMode="decimal" min="0" max="100" step="any" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${field} max-w-40`} />
            <p className="mt-1 text-xs text-muted">Discovery stops when X usage reaches this amount.</p>
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={create.isPending} className={btnPrimary}>
          Create campaign
        </button>
        {!first && (
          <button type="button" onClick={onCancel} className={btnSecondary}>
            Cancel
          </button>
        )}
      </div>
      {missing && (
        <p role="alert" className="text-sm font-medium text-block">
          {missing}
        </p>
      )}
      {create.error && (
        <p role="alert" className="text-sm font-medium text-block">
          {create.error.message}
        </p>
      )}
    </form>
  )
}
