import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import type { CampaignLane, ReadyToDraft, ReviewQueue, SenderProfile, WriteDraftsResult } from '../../../api/src/review/contract'
import { getJson, postJson } from '../api'
import { campaignQuery } from '../campaignQuery'
import Funnel from './Funnel'
import Spinner from '../ui/Spinner'
import NeedsAttention from './NeedsAttention'
import BestMatches from './BestMatches'
import ReadAllPosts from './ReadAllPosts'
import type { Filter as CandidateFilter, Prospect } from '../candidates/Prospects'
import { AlertTriangle, ChevronRight, Search } from '../ui/icons'
import { verdict } from '../review/labels'
import { btnLink, btnPrimary, btnSecondary, money } from '../ui/ui'
import { SKIP_TEXT } from '../candidates/why'
import { ago, day, plural } from '../format'

interface DiscoveryRun {
  at: string
  added: number
  addedHandles?: string[]
  seeds?: { handle: string; following: number; list?: 'followers' }[]
  skipped: { handle: string; reason: string }[]
  spentMicros: number
  stoppedByBudget: boolean
  postsPending: number
}

interface Campaign extends CampaignLane {
  id: number
  name: string
  searching: boolean
  keywords: string[]
  criteria: string[] | null
  handles: string[]
  seeds: string[] | null
  followersOf?: string[] | null
  queries: string[] | null
  lastDiscovery: DiscoveryRun | null
  budgetMicros: number
}

const SEGMENTS = [
  { key: 'strong', label: 'Strong', bar: 'bg-fit-strong' },
  { key: 'possible', label: 'Possible', bar: 'bg-fit-possible' },
  { key: 'weak', label: 'Weak', bar: 'bg-[#a9a9b2]' },
  { key: 'not_a_fit', label: 'Not a fit', bar: 'bg-fit-not' },
  { key: 'unscored', label: 'Not scored yet', bar: 'bg-raised ring-1 ring-inset ring-rule' },
] as const

export default function Overview({ campaignId, onReview, onProspects, onGo, onSettings }: { campaignId: number; onReview: () => void; onSettings: () => void; onProspects: (filter: CandidateFilter) => void; onGo: (page: 'inbox' | 'profile' | 'overview' | 'review') => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState<string | null>(null)

  const campaign = useQuery(campaignQuery<Campaign>(campaignId))
  const waiting = !!campaign.data?.searching
  const prospects = useQuery<Prospect[]>({
    queryKey: ['prospects', campaignId],
    queryFn: () => getJson(`/campaigns/${campaignId}/prospects`),
    refetchInterval: (q) => (waiting || q.state.data?.some((p) => p.scoring || p.drafting) ? 4000 : false),
    refetchIntervalInBackground: true,
  })
  const queue = useQuery<ReviewQueue>({ queryKey: ['review-queue', campaignId], queryFn: () => getJson(`/review-queue?campaignId=${campaignId}`), retry: false })
  const readyQuery = useQuery<ReadyToDraft>({ queryKey: ['ready', campaignId], queryFn: () => getJson(`/campaigns/${campaignId}/drafts/ready`), retry: false })
  const estimate = useQuery<{ estimatedMicros: number }>({ queryKey: ['estimate', campaignId], queryFn: () => getJson(`/campaigns/${campaignId}/estimate`), retry: false })

  const search = useMutation({
    mutationFn: () => postJson<{ queued: boolean; reason?: string }>(`/campaigns/${campaignId}/discover`),
    onSuccess: (r) => {
      setNote(r.queued ? null : (r.reason ?? 'The search did not start.'))
      void qc.invalidateQueries({ queryKey: ['campaign', campaignId] })
    },
  })
  // Scoring right here: new people from a search are useless until they are scored.
  const score = useMutation({
    mutationFn: () => postJson<{ queued: number }>(`/campaigns/${campaignId}/score`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', campaignId] }),
  })
  // Drafts can be written from here, so a search ends one click away from Review.
  const write = useMutation({
    mutationFn: () => postJson<WriteDraftsResult>(`/campaigns/${campaignId}/drafts`, { limit: 10 }),
    onSuccess: () => Promise.all(['review-queue', 'ready', 'prospects'].map((key) => qc.invalidateQueries({ queryKey: [key] }))),
  })
  const searchedAt = campaign.data?.lastDiscovery?.at
  const peopleCount = prospects.data?.length
  // The funnel only polls every 30 s; refresh it when a search lands or the people change so Results so far is not stale.
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: ['funnel', campaignId] })
    void qc.invalidateQueries({ queryKey: ['prospects', campaignId] })
  }, [qc, campaignId, searchedAt, peopleCount])
  // Scoring and drafting finish in the background; the next step card must follow them, not the first load.
  const progress = `${prospects.data?.filter((p) => p.fit !== null).length}|${prospects.data?.filter((p) => p.drafting).length}`
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: ['ready', campaignId] })
    void qc.invalidateQueries({ queryKey: ['review-queue', campaignId] })
  }, [qc, campaignId, progress])

  if (campaign.isLoading) return <p role="status" className="text-sm text-muted">Loading…</p>
  if (campaign.error || !campaign.data) return <p role="alert" className="text-sm font-medium text-block">{campaign.error?.message ?? 'Campaign not found'}</p>

  const c = campaign.data
  const loadError = prospects.error ?? queue.error ?? readyQuery.error
  const people = prospects.data ?? []
  const counts = { strong: 0, possible: 0, weak: 0, not_a_fit: 0, unscored: 0 }
  for (const p of people) counts[p.fit ?? 'unscored'] += 1
  const drafts = (queue.data?.items ?? []).filter((i) => i.status === 'pending')
  const scoringNow = people.filter((p) => p.scoring).length
  const draftingNow = people.filter((p) => p.drafting).length
  const toScore = people.filter((p) => p.fit === null && !p.scoring && p.status !== 'dismissed').length
  const scoreButton = (className: string, label: string) => (
    <button type="button" className={className} disabled={score.isPending} onClick={() => score.mutate()}>
      {score.isPending ? 'Starting…' : label}
    </button>
  )
  const ready = readyQuery.data?.ready ?? 0
  const fromProfile = readyQuery.data?.fromProfile ?? 0
  const byVerdict = (t: string) => drafts.filter((d) => verdict(d).tone === t).length
  const run = c.lastDiscovery
  const sources = [c.handles.length && plural(c.handles.length, 'handle'), c.seeds?.length && plural(c.seeds.length, 'seed account'), c.followersOf?.length && `followers of ${plural(c.followersOf.length, 'account')}`, c.queries?.length && plural(c.queries.length, 'search')].filter(Boolean).join(' · ')
  const firstSearch = !run && people.length === 0 && drafts.length === 0
  const top = people.filter((p) => p.fit === 'strong' || p.fit === 'possible').slice(0, 10)

  return (
    <div className="pb-16">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">{c.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {sources || 'No sources yet'} · {run ? `last search ${ago(run.at)}` : 'no search yet'}
          </p>
          <LaneLine lane={c} campaignId={campaignId} />
        </div>
        {run && (
          <div className="sm:text-right">
            <button type="button" className={btnPrimary} disabled={search.isPending || waiting} onClick={() => search.mutate()}>
              {waiting ? 'Searching…' : 'Search again'}
            </button>
            <p className={`mt-1 text-xs tabular-nums ${run.spentMicros >= c.budgetMicros * 0.9 ? 'font-semibold text-warn' : 'text-muted'}`}>
              Spent {money(run.spentMicros)} of {money(c.budgetMicros)}
            </p>
          </div>
        )}
      </header>
      {loadError && <p role="alert" className="mt-3 text-sm font-medium text-block">Some numbers could not be loaded: {loadError.message}</p>}
      {waiting && !firstSearch && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
          <Spinner className="size-3.5" />
          Searching. This page updates when it finishes.
        </p>
      )}
      {note && <p className="mt-3 text-sm font-medium text-warn" role="status">{note}</p>}
      {search.error && <p role="alert" className="mt-3 text-sm font-medium text-block">{search.error.message}</p>}

      <div key={firstSearch ? 'first-search' : 'results'} className="anim-fade-up">
      <NeedsAttention campaignId={campaignId} onGo={onGo} />

      {firstSearch ? (
        <section aria-label="Next step" className="mx-auto flex min-h-[58vh] max-w-2xl flex-col items-center justify-center py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-rail text-muted">{waiting ? <Spinner className="size-6" /> : <Search className="size-6" />}</span>
          {waiting ? (
            <div role="status">
              <h2 className="mt-6 text-2xl font-bold leading-tight">Searching…</h2>
              <p className="mt-2 text-base text-muted">Reading their profiles and recent posts. You can leave this page: the search keeps going, and the top bar tells you when it is done.</p>
            </div>
          ) : (
            <>
              <h2 className="mt-6 text-2xl font-bold leading-tight">Find your first people</h2>
              <p className="mt-2 text-base text-muted">Check what this search will use. Then we read their posts and score how well they fit.</p>
            </>
          )}
          <SearchUses campaign={c} className="mt-6" />
          {!waiting && (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button type="button" className={btnPrimary} disabled={search.isPending || waiting} onClick={() => search.mutate()}>
                  {waiting ? 'Searching…' : 'Run first search'}
                </button>
                <button type="button" className={btnSecondary} onClick={onSettings}>
                  Edit search
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">
                {/* The estimate assumes every read returns its maximum; the budget is the hard stop. */}
                {estimate.data ? `Up to ${money(estimate.data.estimatedMicros)}, usually much less · ` : ''}the search stops at the budget, {money(c.budgetMicros)}
              </p>
            </>
          )}
          <ol aria-label="What happens next" className="mt-14 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-sm text-muted">
            <li aria-current="step" className="flex items-center gap-2 whitespace-nowrap font-semibold text-ink">
              <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-ink text-xs">1</span>
              Search
            </li>
            <li aria-hidden className="hidden h-px w-8 bg-rule sm:block" />
            <li className="flex items-center gap-2 whitespace-nowrap">
              <span className="grid size-6 place-items-center rounded-full bg-rail text-xs">2</span>
              Review drafts
            </li>
            <li aria-hidden className="hidden h-px w-8 bg-rule sm:block" />
            <li className="flex items-center gap-2 whitespace-nowrap">
              <span className="grid size-6 place-items-center rounded-full bg-rail text-xs">3</span>
              Approve and send
            </li>
          </ol>
        </section>
      ) : (
      <section aria-label="Next step" className="mt-8 flex flex-wrap items-center justify-between gap-x-10 gap-y-4 rounded-2xl border border-rule bg-paper px-5 py-5 sm:px-6">
        {drafts.length > 0 ? (
          <>
            <div>
              <h2 className="text-lg font-semibold leading-snug">
                <span className="text-accent">{drafts.length}</span> {drafts.length === 1 ? 'draft is' : 'drafts are'} waiting for your review
              </h2>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {(
                  [
                    ['ok', 'ready', 'bg-ok'],
                    ['warn', 'to check', 'bg-caution'],
                    ['stop', 'to fix', 'bg-block'],
                  ] as const
                )
                  .filter(([v]) => byVerdict(v))
                  .map(([v, label, dot]) => (
                    <span key={v} className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
                      <span className="tabular-nums">{byVerdict(v)}</span> {label}
                    </span>
                  ))}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <button type="button" className={btnPrimary} onClick={onReview}>
                Review drafts
              </button>
              {ready > 0 && (
                <button type="button" className={btnLink} onClick={() => onProspects('ready')}>
                  {plural(ready, 'person is', 'people are')} ready for a draft in Candidates
                </button>
              )}
              {toScore > 0 && scoreButton(btnLink, `Score ${plural(toScore, 'new person', 'new people')}`)}
            </div>
          </>
        ) : counts.unscored > 0 ? (
          <>
            <div>
              <h2 className="text-lg font-semibold leading-snug">
                {scoringNow > 0 && toScore === 0 ? `Scoring… ${plural(scoringNow, 'person', 'people')} left` : `${plural(counts.unscored, 'person', 'people')} found, not scored yet`}
              </h2>
              <p className="mt-1.5 text-sm text-muted">Scoring reads their recent posts and decides how well each one fits. Drafts are written only for the good ones.</p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {toScore > 0 ? scoreButton(btnPrimary, `Score ${plural(toScore, 'person', 'people')}`) : <Spinner className="size-5" />}
            </div>
          </>
        ) : draftingNow > 0 ? (
          <div role="status">
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-snug">
              <Spinner className="size-4" />
              Writing {plural(draftingNow, 'draft')}…
            </h2>
            <p className="mt-1.5 text-sm text-muted">Each one shows up in Review when it is done.</p>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold leading-snug">
              {loadError ? 'The numbers did not load' : ready > 0 ? `${plural(ready, 'person is', 'people are')} ready for a draft` : people.length ? 'No new people to draft' : 'The last search found no one'}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {loadError
                ? 'Reload the page when the server is back.'
                : ready > 0
                ? `Drafts for the best fits first, up to 10 at a time.${fromProfile ? ` ${plural(fromProfile, 'person has', 'people have')} no recent post, so ${fromProfile === 1 ? 'that draft opens' : 'those drafts open'} with their profile and ${fromProfile === 1 ? 'comes' : 'come'} last.` : ''} Nothing is sent until you approve it.`
                : people.length
                  ? 'Search again to find more people.'
                  : 'Check the handles and keywords, then search again.'}
            </p>
            {ready > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <button type="button" className={btnPrimary} disabled={write.isPending} onClick={() => write.mutate()}>
                  {write.isPending ? 'Starting…' : `Write ${plural(Math.min(ready, 10), 'draft')}`}
                </button>
                <button type="button" className={btnLink} onClick={() => onProspects('ready')}>
                  Pick people in Candidates
                </button>
              </div>
            )}
            {write.error && <p role="alert" className="mt-2 text-sm font-medium text-block">{write.error.message}</p>}
          </div>
        )}
      </section>
      )}

      {people.length > 0 && (
      <section aria-label="What we found" className="mt-10 border-t border-rule pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">What we found</h2>
          <button type="button" className={btnLink} onClick={() => onProspects('all')}>
            View candidates
          </button>
        </div>
        <>
          <p className="mt-3 text-2xl font-semibold leading-none">
            {people.length} <span className="text-sm font-normal text-muted">{people.length === 1 ? 'person' : 'people'}</span>
          </p>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-rail" role="img" aria-label="People by fit">
            {SEGMENTS.map((s) => counts[s.key] > 0 && <div key={s.key} className={s.bar} style={{ width: `${(counts[s.key] / people.length) * 100}%` }} />)}
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {SEGMENTS.map((s) => (
              <li key={s.key} className={`flex items-center gap-2 text-sm ${counts[s.key] === 0 ? 'opacity-50' : ''}`}>
                <span className={`size-2 rounded-full ${s.bar}`} />
                <span className="font-semibold">{counts[s.key]}</span>
                <span className="text-sm text-muted">{s.label}</span>
              </li>
            ))}
          </ul>
        </>
      </section>
      )}

      {top.length > 0 && <BestMatches people={top} />}

      {run && (
        <section aria-label="Last search" className="mt-10 border-t border-rule pt-8">
          {/* Above the list of who was left out, so a stop at the budget is not missed at the end of it. */}
          {run.stoppedByBudget && (
            <div role="note" className="mb-5 flex gap-3 rounded-2xl border border-caution/60 bg-warn-bg p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  The search stopped at the budget: spent <span className="tabular-nums">{money(run.spentMicros)}</span> of{' '}
                  <span className="tabular-nums">{money(c.budgetMicros)}</span>.
                </p>
                <ReadAllPosts campaignId={campaignId} waiting={run.postsPending} onCandidates={() => onProspects('all')} />
              </div>
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-sm">
              <span className="font-semibold">Last search</span>{' '}
              <span className="text-muted">
                {ago(run.at)} · {run.added} added, {run.skipped.length} skipped
              </span>
            </summary>
            {!!run.addedHandles?.length && (
              <p className="mt-3 text-sm text-muted">
                Added: <span className="font-medium text-ink">{handles(run.addedHandles)}</span>
              </p>
            )}
            {!!run.seeds?.length && (
              <p className="mt-2 text-sm text-muted">
                Seeds: {run.seeds.map((x) => `@${x.handle} ${x.list === 'followers' ? (x.following ? `${x.following} followers read` : 'no followers we could read, so it added no one') : x.following ? `follows ${x.following}` : 'follows nobody we could read, so it added no one'}`).join(', ')}
              </p>
            )}
            {run.skipped.length > 0 && (
              <ul aria-label="Skipped" className="mt-3 max-w-2xl divide-y divide-rule overflow-hidden rounded-xl border border-rule text-sm">
                {bySkipReason(run.skipped).map(([reason, list]) => (
                  <li key={reason}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 hover:bg-rail/60">
                        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
                        <span className="flex-1">{SKIP_TEXT[reason] ?? reason}</span>
                        <span className="font-semibold tabular-nums">{list.length}</span>
                      </summary>
                      <p className="pb-3 pl-10 pr-4 text-muted wrap-anywhere">{handles(list)}</p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
      )}

      <Funnel campaignId={campaignId} />
      </div>
    </div>
  )
}

// A search can skip hundreds of people: group them by reason, biggest group first, and cap each list.
const HANDLES_SHOWN = 30
const handles = (list: string[]) =>
  list.slice(0, HANDLES_SHOWN).map((h) => `@${h}`).join(', ') + (list.length > HANDLES_SHOWN ? ` and ${list.length - HANDLES_SHOWN} more` : '')
const bySkipReason = (skipped: { handle: string; reason: string }[]) => {
  const groups = new Map<string, string[]>()
  for (const x of skipped) groups.set(x.reason, [...(groups.get(x.reason) ?? []), x.handle])
  return [...groups].sort((a, b) => b[1].length - a[1].length)
}

// "+3 more": the rest of the list is in its hover hint.
const More = ({ items, joiner = ', ' }: { items: string[]; joiner?: string }) => (
  <span title={items.join(joiner)} className="cursor-help text-muted underline decoration-dotted underline-offset-4">
    +{items.length} more
  </span>
)
const shown = (items: string[], max: number) => (
  <>
    {items.slice(0, max).join(', ')}
    {items.length > max && (
      <>
        {' '}
        <More items={items.slice(max)} />
      </>
    )}
  </>
)

// What a search will look at, before it runs: the person can check it and change it in Settings.
function SearchUses({ campaign: c, className = '' }: { campaign: Campaign; className?: string }) {
  const profile = useQuery<SenderProfile>({ queryKey: ['sender-profile'], queryFn: () => getJson('/sender-profile'), retry: false })
  const program = profile.data?.programs.find((p) => p.id === c.programId)
  const at = (h: string) => `@${h.replace(/^@/, '')}`
  const rows: [string, ReactNode][] = [
    [
      'Keywords',
      <ul key="k" className="flex flex-wrap gap-1.5">
        {c.keywords.map((k) => (
          <li key={k} className="rounded-full bg-rail px-2.5 py-0.5 text-xs">
            {k}
          </li>
        ))}
      </ul>,
    ],
  ]
  if (c.handles.length) rows.push(['Handles', shown(c.handles.map(at), 4)])
  if (c.seeds?.length) rows.push(['Seed accounts', shown(c.seeds.map(at), 3)])
  if (c.followersOf?.length) rows.push(['Followers of', shown(c.followersOf.map(at), 3)])
  if (c.queries?.length) rows.push(['Search queries', shown(c.queries, 3)])
  rows.push([
    'Fund criteria',
    c.criteria?.length ? (
      <ul key="c" className="space-y-0.5">
        {c.criteria.slice(0, 3).map((t) => (
          <li key={t}>{t}</li>
        ))}
        {c.criteria.length > 3 && (
          <li>
            <More items={c.criteria.slice(3)} joiner={String.fromCharCode(10)} />
          </li>
        )}
      </ul>
    ) : (
      'None set'
    ),
  ])
  rows.push(['Offers', program ? `${program.name}${program.deadline ? `, closes ${day(program.deadline)}` : ''}` : 'No program chosen'])

  return (
    <section aria-label="What this search uses" className={`w-full max-w-xl rounded-2xl border border-rule bg-paper px-5 py-4 text-left ${className}`}>
      <h3 className="text-sm font-semibold">What this search uses</h3>
      <dl className="mt-3 space-y-2.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}


// The program this campaign offers and its call post.
function LaneLine({ lane: l, campaignId }: { lane: CampaignLane; campaignId: number }) {
  const qc = useQueryClient()
  const check = useMutation({
    mutationFn: () => postJson<{ attached: number; read: number; costMicros: number }>(`/campaigns/${campaignId}/inbound/check`),
    onSuccess: () => Promise.all(['prospects', 'top-bar', 'funnel'].map((key) => qc.invalidateQueries({ queryKey: [key] }))),
  })
  const profile = useQuery<SenderProfile>({ queryKey: ['sender-profile'], queryFn: () => getJson('/sender-profile'), retry: false })
  const program = profile.data?.programs.find((p) => p.id === l.programId)
  return (
    <p className="mt-1 text-sm text-muted">
      {program ? (
        `Offers ${program.name}${program.deadline ? `, closes ${day(program.deadline)}` : ''}`
      ) : (
        <span className="font-medium text-warn" title="Drafts offer no program until you pick one in Settings, Campaign.">
          No program chosen
        </span>
      )}
      {l.callPostUrl && l.callPostedAt && (
        <>
          {' · '}
          <a className="underline underline-offset-4" href={l.callPostUrl} target="_blank" rel="noreferrer">
            Call post
          </a>{' '}
          of {day(l.callPostedAt)}, keyword “{l.callKeyword}”
          {' · '}
          <button type="button" className={btnLink} disabled={check.isPending} onClick={() => check.mutate()} title="Reads up to 10 recent DMs, about $0.01 each. The worker also checks every 30 minutes.">
            Check now
          </button>
          {check.data && (
            <span role="status" className="ml-2">
              {check.data.attached === 0 ? 'No new answers' : `${check.data.attached} new ${check.data.attached === 1 ? 'answer' : 'answers'}`} · {check.data.read} read, {money(check.data.costMicros)}
            </span>
          )}
          {check.error && (
            <span role="alert" className="ml-2 font-medium text-block">
              {check.error.message}
            </span>
          )}
        </>
      )}
    </p>
  )
}
