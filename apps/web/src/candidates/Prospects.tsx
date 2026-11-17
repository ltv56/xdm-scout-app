import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ReviewQueue } from '../../../api/src/review/contract'
import { getJson } from '../api'
import EmptyState from '../ui/EmptyState'
import CandidateActions from './CandidateActions'
import CandidateRow from './CandidateRow'
import Select from '../ui/Select'
import { LANDS_IN_HINT, LANDS_IN_LABEL, RELATIONSHIP_LABEL } from '../review/labels'
import { btnSecondary } from '../ui/ui'

interface Claim {
  side: 'for' | 'against' | 'unknown'
  text: string
  status: 'verified' | 'inferred' | 'unsure'
  evidence: { id: string; url: string }[]
}

export interface Prospect {
  id: number
  handle: string
  name: string
  bio: string
  followers: number
  seedCount: number
  lastPostAt: string | null
  criteria: { text: string; status: 'met' | 'not_met' | 'unknown'; evidenceIds: string[] }[]
  fit: 'strong' | 'possible' | 'weak' | 'not_a_fit' | null
  relationship: 'messaged_us' | 'follower' | 'engaged' | 'adjacent' | 'cold'
  status: 'new' | 'shortlisted' | 'dismissed'
  scoring: boolean
  // Where this person's send stands in the Outbox ("Send in X", "Sent"...), or null when nothing was sent.
  outbox: string | null
  role: string | null
  areas: string[]
  identityWarning: boolean
  landsIn: 'inbox' | 'requests' | 'cant_receive' | null
  call: { text: string; at: string; invitationConfirmed: boolean } | null
  fundList: { name: string; kind: 'known' | 'warm'; event: string | null } | null
  opening: { type: string; summary: string | null; freshness: 'fresh' | 'stale' | 'expired'; url: string | null; date: string } | null
  claims: Claim[]
}

type SortKey = 'default' | 'fit' | 'relationship' | 'followers' | 'seeds' | 'lastPost'
type Dir = 'asc' | 'desc'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'default', label: 'Best fit first' },
  { id: 'fit', label: 'Fit' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'followers', label: 'Followers' },
  { id: 'seeds', label: 'Seeds following' },
  { id: 'lastPost', label: 'Last post' },
]

const FIT_RANK = { strong: 4, possible: 3, weak: 2, not_a_fit: 1 }
const RELATIONSHIP_RANK = { messaged_us: 5, engaged: 4, follower: 3, adjacent: 2, cold: 1 }

// Sort value: bigger means "more". Missing values sort last in both directions.
function sortValue(p: Prospect, key: SortKey): number | null {
  if (key === 'fit') return p.fit ? FIT_RANK[p.fit] : null
  if (key === 'relationship') return RELATIONSHIP_RANK[p.relationship]
  if (key === 'followers') return p.followers
  if (key === 'seeds') return p.seedCount
  if (key === 'lastPost') return p.lastPostAt ? new Date(p.lastPostAt).getTime() : null
  return null
}

function sortProspects(list: Prospect[], key: SortKey, dir: Dir): Prospect[] {
  if (key === 'default') return list
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const x = sortValue(a, key)
    const y = sortValue(b, key)
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return (x - y) * sign
  })
}

type RelationshipFilter = Prospect['relationship'] | 'any'

const RELATIONSHIP_OPTIONS: { id: RelationshipFilter; label: string }[] = [
  { id: 'any', label: 'Any relationship' },
  { id: 'messaged_us', label: RELATIONSHIP_LABEL.messaged_us },
  { id: 'engaged', label: RELATIONSHIP_LABEL.engaged },
  { id: 'follower', label: RELATIONSHIP_LABEL.follower },
  { id: 'adjacent', label: 'Adjacent' },
  { id: 'cold', label: 'Cold' },
]

type LandsInFilter = NonNullable<Prospect['landsIn']> | 'unknown' | 'any'

const LANDS_IN_OPTIONS: { id: LandsInFilter; label: string }[] = [
  { id: 'any', label: 'All' },
  { id: 'inbox', label: LANDS_IN_LABEL.inbox },
  { id: 'requests', label: LANDS_IN_LABEL.requests },
  { id: 'cant_receive', label: LANDS_IN_LABEL.cant_receive },
  { id: 'unknown', label: 'Unknown' },
]

export type Filter = 'all' | 'ready' | 'drafted' | 'not_a_fit'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready for a draft' },
  { id: 'drafted', label: 'Drafted' },
  { id: 'not_a_fit', label: 'Not a fit' },
]

const PAGE_SIZE = 5

export default function Prospects({ campaignId, onReview, onOverview, initialFilter = 'all' }: { campaignId: number; onReview: () => void; onOverview: () => void; initialFilter?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [relationship, setRelationship] = useState<RelationshipFilter>('any')
  const [landsIn, setLandsIn] = useState<LandsInFilter>('any')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [dir, setDir] = useState<Dir>('desc')
  // Five people a page; any change of filter or order starts again at the first page.
  const view = [filter, relationship, landsIn, sortKey, dir].join('|')
  const [paged, setPaged] = useState({ view, page: 0 })
  const page = paged.view === view ? paged.page : 0
  const listTop = useRef<HTMLParagraphElement>(null)
  const { data, error, isLoading } = useQuery<Prospect[]>({
    queryKey: ['prospects', campaignId],
    queryFn: () => getJson(`/campaigns/${campaignId}/prospects`),
    refetchInterval: (q) => (q.state.data?.some((p) => p.scoring) ? 4_000 : false),
    refetchIntervalInBackground: true,
  })
  const queue = useQuery<ReviewQueue>({ queryKey: ['review-queue', campaignId], queryFn: () => getJson(`/review-queue?campaignId=${campaignId}`), retry: false })
  const inReview = new Set((queue.data?.items ?? []).map((i) => i.prospect.handle))

  if (isLoading) return <p role="status" className="text-sm text-muted">Loading candidates…</p>
  if (error) return <p role="alert" className="text-sm font-medium text-block">{error.message}</p>
  if (!data?.length) return <EmptyState title="No candidates yet" text="Run a search from the Overview." action={{ label: 'Go to Overview', onClick: onOverview }} />

  // Ready: could get a draft now. Same rule as the Overview and the Write drafts button.
  const isReady = (p: Prospect) => p.status !== 'dismissed' && (p.fit === 'strong' || p.fit === 'possible') && !!p.opening && p.opening.freshness !== 'expired' && !inReview.has(p.handle) && p.landsIn !== 'cant_receive'
  const matches: Record<Filter, (p: Prospect) => boolean> = {
    all: () => true,
    ready: isReady,
    drafted: (p) => inReview.has(p.handle),
    not_a_fit: (p) => p.fit === 'not_a_fit',
  }
  const byRelationship = (p: Prospect) => relationship === 'any' || p.relationship === relationship
  const byLandsIn = (p: Prospect) => landsIn === 'any' || (p.landsIn ?? 'unknown') === landsIn
  const shown = sortProspects(data.filter((p) => matches[filter](p) && byRelationship(p) && byLandsIn(p)), sortKey, dir)
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const at = Math.min(page, pages - 1)
  const onPage = shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE)
  const goTo = (n: number) => {
    setPaged({ view, page: n })
    listTop.current?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="pb-16">
      <h1 className="text-[28px] font-bold leading-tight">Candidates</h1>
      <p className="mt-1 text-sm text-muted">The people this campaign found, best fit first. Review holds only the ones with a draft.</p>
      <div className="mt-5 rounded-2xl bg-paper p-4">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${filter === f.id ? 'bg-ink text-white' : 'bg-rail hover:bg-rule'}`}
          >
            {f.label} <span className={filter === f.id ? 'text-white/70' : 'text-muted'}>{data.filter(matches[f.id]).length}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-3 text-sm">
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-muted">Relationship</span>
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value as RelationshipFilter)} wrapperClassName="min-w-0 flex-1 sm:w-auto sm:flex-none" className="py-1.5">
            {RELATIONSHIP_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-muted" title={LANDS_IN_HINT}>Likely lands in</span>
          <Select value={landsIn} onChange={(e) => setLandsIn(e.target.value as LandsInFilter)} wrapperClassName="min-w-0 flex-1 sm:w-auto sm:flex-none" className="py-1.5">
            {LANDS_IN_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-muted">Sort by</span>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} wrapperClassName="min-w-0 flex-1 sm:w-auto sm:flex-none" className="py-1.5">
            {SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          className={btnSecondary}
          disabled={sortKey === 'default'}
          aria-label={dir === 'desc' ? 'Sorted high to low, switch to low to high' : 'Sorted low to high, switch to high to low'}
          onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')}
        >
          {dir === 'desc' ? 'High to low' : 'Low to high'}
        </button>
      </div>
      <CandidateActions campaignId={campaignId} unscored={data.filter((p) => p.fit === null && !p.scoring && p.status !== 'dismissed').length} scoring={data.filter((p) => p.scoring).length} ready={data.filter(isReady).length} />
      </div>
      <p ref={listTop} className="mt-6 scroll-mt-4 border-b border-rule pb-2 text-sm font-medium text-muted" role="status">
        {shown.length === 1 ? '1 candidate shown' : `${shown.length} candidates shown`}
      </p>
      {shown.length === 0 && <p className="mt-6 text-sm text-muted">Nobody in this list.</p>}
      <ul className="mt-3 space-y-1">
        {onPage.map((p, i) => (
          <CandidateRow key={p.id} p={p} index={i} campaignId={campaignId} inReview={inReview.has(p.handle)} onReview={onReview} />
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-between gap-4 border-t border-rule pt-4 text-sm">
          <button type="button" className={btnSecondary} disabled={at === 0} onClick={() => goTo(at - 1)}>
            Previous
          </button>
          <span className="text-muted">
            Page {at + 1} of {pages}
          </span>
          <button type="button" className={btnSecondary} disabled={at === pages - 1} onClick={() => goTo(at + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  )
}
