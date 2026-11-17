import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { CampaignSummary, ReviewQueue as Queue, SenderProfile as Profile } from '../../api/src/review/contract'
import { getJson } from './api'
import Account from './settings/Account'
import Activity from './settings/Activity'
import AccountMenu from './shell/AccountMenu'
import CampaignPicker from './campaign/CampaignPicker'
import { User as UserIcon } from './ui/icons'
import Messages, { type MessagesTab } from './messages/Messages'
import MobileMenu from './shell/MobileMenu'
import NewCampaign from './campaign/NewCampaign'
import Onboarding from './onboarding/Onboarding'
import Overview from './overview/Overview'
import Prospects, { type Filter as CandidateFilter } from './candidates/Prospects'
import ReviewQueue from './review/ReviewQueue'
import { readRoute, writeRoute } from './route'
import Settings from './settings/Settings'
import TooltipLayer from './ui/TooltipLayer'
import StatusStrip from './shell/StatusStrip'

interface Health {
  status: string
  db: string
}

const TABS = [
  // Work order: find people, review drafts, then send and read replies.
  { id: 'overview', label: 'Overview' },
  { id: 'prospects', label: 'Candidates' },
  { id: 'review', label: 'Review' },
  { id: 'messages', label: 'Messages' },
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' },
  { id: 'activity', label: 'Activity' },
] as const
type Tab = (typeof TABS)[number]['id']

const isTab = (page: string | null): page is Tab => TABS.some((t) => t.id === page)
const isMessagesTab = (sub: string | null): sub is MessagesTab => sub === 'inbox' || sub === 'outbox'

export default function App() {
  const [start] = useState(readRoute)
  const [tab, setTab] = useState<Tab>(isTab(start.page) ? start.page : 'overview')
  const [messagesTab, setMessagesTab] = useState<MessagesTab>(isMessagesTab(start.sub) ? start.sub : 'outbox')
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('all')
  const [campaignId, setCampaignId] = useState<number | null>(start.campaignId)
  const [creating, setCreating] = useState(false)
  // Open in Review on a candidate opens that person's draft, not the first in the queue.
  const [reviewFocus, setReviewFocus] = useState<string | null>(null)
  const openReview = (handle: string | null = null) => {
    setReviewFocus(handle)
    setTab('review')
  }
  const health = useQuery<Health>({ queryKey: ['health'], queryFn: () => getJson('/health') })
  const campaigns = useQuery<CampaignSummary[]>({ queryKey: ['campaigns'], queryFn: () => getJson('/campaigns') })

  const list = campaigns.data ?? []
  // A campaign named in the URL that no longer exists falls back to the newest one.
  const active = list.find((c) => c.id === campaignId)?.id ?? list[0]?.id ?? null
  useEffect(() => {
    if (campaigns.isSuccess) writeRoute(active, tab, tab === 'messages' ? messagesTab : undefined)
  }, [campaigns.isSuccess, active, tab, messagesTab])
  const queue = useQuery<Queue>({
    queryKey: ['review-queue', active],
    queryFn: () => getJson(`/review-queue?campaignId=${active}`),
    enabled: active !== null,
    retry: false,
  })
  const waiting = (queue.data?.items ?? []).filter((i) => i.status === 'pending').length
  const profile = useQuery<Profile>({ queryKey: ['sender-profile'], queryFn: () => getJson('/sender-profile'), retry: false })
  const initials = (profile.data?.signer ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

  // Links written as 'inbox' (Overview, Needs attention) open that tab inside Messages.
  const go = (page: Tab | 'inbox') => {
    if (page === 'inbox') {
      setMessagesTab('inbox')
      setTab('messages')
    } else setTab(page)
  }

  const scroll = 'h-full overflow-y-auto px-5 py-8 sm:px-12 sm:py-10'

  // Until the campaigns load we cannot tell the first run from a normal one; showing the menu here made it flash before onboarding.
  if (campaigns.isPending) return null
  // The first run has no campaign yet: connect, fill the profile and start one before any menu shows.
  if (campaigns.isSuccess && list.length === 0) {
    return <Onboarding onCreated={(id) => { setCampaignId(id); setTab('overview') }} />
  }

  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-raised focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-pop">
        Skip to content
      </a>
      <MobileMenu
        sections={TABS.filter((t) => t.id !== 'profile' && t.id !== 'settings' && t.id !== 'activity').map((t) => ({ id: t.id, label: t.label }))}
        pages={TABS.filter((t) => t.id === 'profile' || t.id === 'settings' || t.id === 'activity').map((t) => ({ id: t.id, label: t.label }))}
        tab={creating ? 'new' : tab}
        waiting={waiting}
        list={list}
        active={active}
        apiDown={!!(health.error || (health.data && health.data.status !== 'ok'))}
        onSection={(id) => {
          setTab(id as Tab)
          setCreating(false)
        }}
        onPage={(id) => {
          setTab(id as Tab)
          setCreating(false)
        }}
        onSelect={(id) => {
          setCampaignId(id)
          setCreating(false)
          if (tab === 'profile' || tab === 'settings' || tab === 'activity') setTab('overview')
        }}
        onNew={() => {
          if (tab === 'profile' || tab === 'settings' || tab === 'activity') setTab('overview')
          setCreating(true)
        }}
      />
      <header className="mx-auto hidden w-full max-w-[1280px] shrink-0 flex-wrap items-center gap-x-10 gap-y-2 px-6 py-5 text-sm sm:flex lg:flex-nowrap">
        <span className="shrink-0 whitespace-nowrap text-base font-bold tracking-tight text-ink">xdm-scout</span>
        <nav aria-label="Sections" className="flex shrink-0 flex-wrap gap-x-6">
          {TABS.filter((t) => t.id !== 'profile' && t.id !== 'settings' && t.id !== 'activity').map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setReviewFocus(null)
                setCreating(false)
              }}
              aria-current={tab === t.id && !creating ? 'page' : undefined}
              className={`relative py-1 transition-colors ${tab === t.id && !creating ? "font-semibold text-ink after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-accent" : 'text-muted hover:text-ink'}`}
            >
              {t.label}
              {t.id === 'review' && waiting > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-ink">{waiting}</span>}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 lg:ml-auto lg:flex-nowrap">
          <StatusStrip campaignId={active} onSearchDone={() => { setTab('overview'); setCreating(false) }} />
          <CampaignPicker
            list={list}
            active={active}
            onSelect={(id) => {
              setCampaignId(id)
              setCreating(false)
              if (tab === 'profile' || tab === 'settings' || tab === 'activity') setTab('overview')
            }}
            onNew={() => {
              if (tab === 'profile' || tab === 'settings' || tab === 'activity') setTab('overview')
              setCreating(true)
            }}
          />
          <div className="flex items-center gap-4">
            {(health.error || (health.data && health.data.status !== 'ok')) && <span className="text-xs font-medium text-block">API unreachable</span>}
            <AccountMenu
              current={tab === 'profile' || tab === 'settings' || tab === 'activity' ? tab : null}
              onSelect={(page) => {
                setTab(page)
                setCreating(false)
              }}
            >
              {initials || <UserIcon className="size-4" />}
            </AccountMenu>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1280px] px-6 pb-6 lg:min-h-0 lg:flex-1">
        <div className="overflow-hidden rounded-3xl bg-raised shadow-soft lg:h-full lg:min-h-[460px]">
          <div key={`${tab}-${creating}-${active === null}`} className="anim-fade-up lg:h-full">
          {tab === 'profile' || tab === 'settings' || tab === 'activity' ? (
            <div className={scroll}>{tab === 'profile' ? <Account /> : tab === 'settings' ? <Settings campaignId={active} /> : <Activity />}</div>
          ) : creating || active === null ? (
            <div className={scroll}>
              <NewCampaign
                first={active === null}
                onCancel={() => setCreating(false)}
                onCreated={(id) => {
                  setCampaignId(id)
                  setCreating(false)
                  setTab('overview')
                }}
              />
            </div>
          ) : tab === 'overview' ? (
            <div className={scroll}>
              <Overview campaignId={active} onReview={() => openReview()} onSettings={() => setTab('settings')} onGo={(page) => page !== 'overview' && go(page)} onProspects={(f) => {
                  setCandidateFilter(f)
                  setTab('prospects')
                }}
              />
            </div>
          ) : tab === 'review' ? (
            <ReviewQueue campaignId={active} focus={reviewFocus} onGo={setTab} />
          ) : tab === 'messages' ? (
            <Messages campaignId={active} tab={messagesTab} onTab={setMessagesTab} onReview={() => openReview()} />
          ) : (
            <div className={scroll}>
              <Prospects key={candidateFilter} campaignId={active} onReview={(handle) => openReview(handle ?? null)} onOverview={() => setTab('overview')} initialFilter={candidateFilter} />
            </div>
          )}
          </div>
        </div>
      </main>
      <TooltipLayer />
    </div>
  )
}
