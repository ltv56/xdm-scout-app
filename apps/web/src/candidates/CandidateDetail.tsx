import { count } from '../format'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getJson, postJson } from '../api'
import { LANDS_IN_LABEL, RELATIONSHIP_LABEL, shortDate } from '../review/labels'
import { AlertTriangle, CheckCircle, ChevronLeft, Globe, MinusCircle, QuestionCircle, User, XCircle, XLogo } from '../ui/icons'
import Spinner from '../ui/Spinner'
import InfoTip from '../ui/InfoTip'
import XLink from '../ui/XLink'
import { btnLink, btnSmall, btnSmallQuiet, btnToolbar, chip, money, tone } from '../ui/ui'
import { DraftControl, ScoreControl } from './CandidateRow'
import FitBadge from './FitBadge'
import type { Prospect } from './Prospects'
import { CLAIM_CHIP, fitHeading, INFO, landsInWhy, noOpeningText, permissionWhy, RELATIONSHIP_WHY } from './why'

type Detail = Omit<Prospect, 'claims'> & {
  posts: { id: string; text: string; date: string; url: string; opening: boolean; cited: boolean }[]
  claims: (Omit<Prospect['claims'][number], 'evidence'> & { evidence: { id: string; url: string; excerpt: string | null }[] })[]
}

const CRITERION = {
  met: { label: 'Met', note: 'a post or the bio shows it', text: 'text-ok', Icon: CheckCircle },
  not_met: { label: 'Not met', note: 'a post or the bio shows otherwise', text: 'text-block', Icon: XCircle },
  unknown: { label: 'Unknown', note: 'nothing read shows it either way', text: 'text-muted', Icon: QuestionCircle },
}

function Section({ title, info, aside, children }: { title: string; info?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-raised p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-base font-semibold">
          {title}
          {info && <InfoTip label={title} text={info} />}
        </h3>
        {aside && <span className="text-right text-xs text-muted">{aside}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

// One line with an icon in front, the shape every section uses.
function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function LandRow({ icon, label, info, value, why }: { icon: ReactNode; label: string; info: string; value: string; why: string }) {
  return (
    <li>
      <Row icon={icon}>
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted">
          {label}
          <InfoTip label={label} text={info} />
        </p>
        <p className="mt-0.5 font-semibold">{value}</p>
        <p className="mt-0.5 text-muted">{why}</p>
      </Row>
    </li>
  )
}

function Stat({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-paper px-3 py-2.5">
      <dt className="flex items-center gap-1 text-xs text-muted">
        {label}
        {info && <InfoTip label={label} text={info} />}
      </dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

const SIDE = {
  for: { title: 'For', Icon: CheckCircle, className: 'text-ok' },
  against: { title: 'Against', Icon: MinusCircle, className: 'text-block' },
}

function Reasons({ side, list }: { side: 'for' | 'against'; list: Detail['claims'] }) {
  if (!list.length) return null
  const { title, Icon, className } = SIDE[side]
  return (
    <div className="mt-5 first:mt-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {title} <span className="tabular-nums">· {list.length}</span>
      </p>
      <ul className="mt-2 space-y-3">
        {list.map((c, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="wrap-anywhere">{c.text}</span>
              <span className="inline-flex items-center gap-0.5">
                <span className={`${chip} ${CLAIM_CHIP[c.status].className}`}>{CLAIM_CHIP[c.status].label}</span>
                <InfoTip label={CLAIM_CHIP[c.status].label} text={CLAIM_CHIP[c.status].meaning} />
              </span>
              {c.evidence.map((e) => (
                <XLink key={e.id} href={e.url} label={e.id.startsWith('bio:') ? 'Open their bio on X' : 'Open the post on X'} />
              ))}
            </div>
            {c.evidence.some((e) => e.excerpt) && (
              <blockquote className="mt-1.5 border-l-2 border-rule pl-3 text-xs text-muted wrap-anywhere">“{c.evidence.find((e) => e.excerpt)?.excerpt}”</blockquote>
            )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Up to 15 posts at $0.005 each; the API says the same in its refusal.
const READ_COST = '$0.08'

// Reads this person's posts now, after the user agrees to the cost. Scoring again costs a model call, so it is offered, not done.
function ReadPosts({ campaignId, id, label, onStart }: { campaignId: number; id: number; label: string; onStart: () => void }) {
  const qc = useQueryClient()
  const [asking, setAsking] = useState(false)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['prospect', campaignId, id] }), qc.invalidateQueries({ queryKey: ['prospects', campaignId] })])
  const read = useMutation({
    mutationFn: () => postJson<{ posts: number; costMicros: number; spentMicros: number; budgetMicros: number }>(`/campaigns/${campaignId}/prospects/${id}/read-posts`, { raiseBudget: true }),
    onSuccess: () => {
      setAsking(false)
      return refresh()
    },
  })
  const rescore = useMutation({ mutationFn: () => postJson(`/campaigns/${campaignId}/prospects/${id}/score`, { again: true }), onSuccess: refresh })

  if (read.data) {
    const r = read.data
    return (
      <div role="status" aria-live="polite" className="mt-3 rounded-xl bg-rail/60 p-3 text-sm">
        <p>
          Read {r.posts} {r.posts === 1 ? 'post' : 'posts'} for {money(r.costMicros)}. Campaign spend {money(r.spentMicros)} of {money(r.budgetMicros)}.
        </p>
        {r.posts > 0 && !rescore.isSuccess && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" className={btnSmallQuiet} disabled={rescore.isPending} onClick={() => rescore.mutate()}>
              {rescore.isPending ? 'Asking…' : 'Score again · under $0.01'}
            </button>
            <span className="text-xs text-muted">Uses the model on the new posts. The Fit and the opening may change.</span>
          </div>
        )}
        {rescore.isSuccess && <p className="mt-2 text-muted">Scoring again. This screen updates when it is done.</p>}
        {rescore.error && <p role="alert" className="mt-2 font-medium text-block">{rescore.error.message}</p>}
      </div>
    )
  }
  if (!asking) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          className={btnSmall}
          onClick={() => {
            setAsking(true)
            onStart()
          }}
        >
          {label}
        </button>
        <span className="text-xs text-muted">Up to {READ_COST}, about $0.005 a post</span>
      </p>
    )
  }
  return (
    <div className="mt-3 rounded-xl border border-rule p-3 text-sm">
      <p>Reads up to 15 of their newest posts from X. Costs up to {READ_COST}. If the campaign budget is used up, it goes up by what this read needs, no more.</p>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className={btnSmall} disabled={read.isPending} onClick={() => read.mutate()}>
          {read.isPending ? 'Reading…' : 'Read posts'}
        </button>
        <button type="button" className={btnLink} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
      {read.error && <p role="alert" className="mt-2 font-medium text-block">{read.error.message}</p>}
    </div>
  )
}

function postsPerWeek(posts: Detail['posts']) {
  if (posts.length < 2) return null
  const times = posts.map((p) => new Date(p.date).getTime())
  const days = (Math.max(...times) - Math.min(...times)) / 86_400_000
  return days >= 1 ? Math.round((posts.length / (days / 7)) * 10) / 10 : null
}

interface Props {
  campaignId: number
  id: number
  inReview: boolean
  onReview: (handle?: string) => void
  onClose: () => void
}

// Everything about one candidate, and why each label is there. Opens over the list so closing it returns to the same page.
export default function CandidateDetail({ campaignId, id, inReview, onReview, onClose }: Props) {
  const back = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // Once a read starts, its result stays on screen even after the refetch says the posts are now read.
  const [reading, setReading] = useState(false)
  const { data: p, error } = useQuery<Detail>({
    queryKey: ['prospect', campaignId, id],
    queryFn: () => getJson(`/campaigns/${campaignId}/prospects/${id}`),
    // While the worker scores them again, ask every few seconds so the new Fit shows up.
    refetchInterval: (q) => (q.state.data?.scoring ? 3_000 : false),
  })

  useEffect(() => {
    back.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      // Tab stays inside the dialog: the list behind it is not reachable until it closes.
      if (e.key !== 'Tab' || !box.current) return
      const items = [...box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const claims = p?.claims ?? []
  const lead = p?.why
  const permission = p ? permissionWhy(p) : null
  const weekly = p ? postsPerWeek(p.posts) : null

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="candidate-title" className="anim-slide-in flex h-full w-full flex-col bg-paper shadow-pop sm:max-w-2xl sm:rounded-l-2xl">
        <header className="border-b border-rule bg-raised px-5 pb-4 pt-3 sm:rounded-tl-2xl sm:px-7">
          <button ref={back} type="button" className={`${btnToolbar} -ml-3 inline-flex items-center gap-1`} onClick={onClose}>
            <ChevronLeft className="size-4" />
            Back
          </button>
          {!p ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted">
              {error ? <span className="font-medium text-block">{error.message}</span> : <><Spinner className="size-4" /> Loading…</>}
            </p>
          ) : (
            <div className="mt-3 flex items-start gap-4">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-rail text-lg font-semibold text-muted">
                {(p.name || p.handle).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="candidate-title" className="text-xl font-bold leading-tight text-balance wrap-anywhere">
                  {p.name || `@${p.handle}`}
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span>@{p.handle}</span>
                  <XLink href={`https://x.com/${p.handle}`} label={`Open @${p.handle} on X`} />
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{count(p.followers)} followers</span>
                  {p.lastPostAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>last post {shortDate(p.lastPostAt)}</span>
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <FitBadge fit={p.fit} />
                    <InfoTip label="Fit" text={p.fit === null ? INFO.unscored : INFO.fit} />
                  </span>
                  {p.status === 'dismissed' && <span className={`${chip} bg-rail text-muted`}>Dismissed</span>}
                  {p.outbox && <span className={`${chip} ${tone[p.outbox === 'Sent' ? 'ok' : 'warn'].chip}`}>In Outbox · {p.outbox}</span>}
                  {!p.outbox && inReview && <span className={`${chip} ${tone.done.chip}`}>Draft written</span>}
                </div>
              </div>
            </div>
          )}
          {/* Full width under the name, so a long reason never squeezes into a narrow column. */}
          {lead && (
            <p className="mt-3 text-sm sm:pl-16">
              <span className="text-muted">Mainly because: </span>
              <span className="font-medium">{lead.text}</span> <InfoTip label="Mainly because" text={INFO.mainly} />
            </p>
          )}
          {p && p.status !== 'dismissed' && (
            <div className="mt-3 sm:pl-16">{p.fit === null ? <ScoreControl p={p as unknown as Prospect} campaignId={campaignId} /> : <DraftControl p={p as unknown as Prospect} campaignId={campaignId} inReview={inReview} onReview={onReview} />}</div>
          )}
        </header>

        {p && (
          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
            <Section title="Profile">
              {p.bio && <blockquote className="border-l-2 border-rule pl-3 text-sm wrap-anywhere">{p.bio}</blockquote>}
              {p.location && (
                <p className="mt-2 text-sm text-muted wrap-anywhere">
                  Location on X: <span className="text-ink">{p.location}</span>
                </p>
              )}
              {p.website && /^https?:\/\//.test(p.website) && (
                <p className="mt-2 text-sm text-muted wrap-anywhere">
                  Website:{' '}
                  <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-2">
                    {p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                </p>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Followers" value={count(p.followers)} />
                <Stat label="Last post" value={p.lastPostAt ? (shortDate(p.lastPostAt) ?? '-') : 'Not read'} />
                <Stat label="Posts a week" value={weekly === null ? 'Too few read' : String(weekly)} info={INFO.postsPerWeek} />
                <Stat label="Seeds" value={String(p.seedCount)} info={INFO.seeds} />
              </dl>
              {(p.fundList || p.identityWarning) && (
                <div className="mt-4 space-y-2 border-t border-rule pt-3">
                  {p.fundList && (
                    <Row icon={<CheckCircle className="size-4 text-accent" />}>
                      <p className="font-medium text-accent">Known to the fund · {p.fundList.name}{p.fundList.event ? ` · ${p.fundList.event}` : ''}</p>
                    </Row>
                  )}
                  {p.identityWarning && (
                    <Row icon={<AlertTriangle className="size-4 text-warn" />}>
                      <p className="font-medium text-warn">Identity not confirmed: the bio says parody or fan.</p>
                    </Row>
                  )}
                </div>
              )}
            </Section>

            <Section title={fitHeading(p.fit)}>
              {p.scoring && (
                <p role="status" className="mb-3 flex items-center gap-2 text-sm text-muted">
                  <Spinner className="size-4" /> Scoring again with the posts just read…
                </p>
              )}
              {p.fit === null ? (
                <p className="text-sm text-muted">Score reads their posts and decides how well they fit. Nothing is guessed before that.</p>
              ) : claims.length === 0 ? (
                <p className="text-sm text-muted">The model gave no reasons this time. Read their posts below before you decide.</p>
              ) : (
                <>
                  <Reasons side="for" list={claims.filter((c) => c.side === 'for')} />
                  <Reasons side="against" list={claims.filter((c) => c.side === 'against')} />
                  {claims.some((c) => c.side === 'unknown') && (
                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Not known</p>
                      <ul className="mt-2 space-y-1.5 text-sm text-muted">
                        {claims.filter((c) => c.side === 'unknown').map((c, i) => (
                          <li key={i} className="flex gap-2.5">
                            <QuestionCircle className="mt-0.5 size-4 shrink-0" />
                            <span className="wrap-anywhere">{c.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {p.criteria.length > 0 && (
                <div className="mt-5 border-t border-rule pt-4">
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Fund criteria
                  <InfoTip label="Fund criteria" text={INFO.criteria} />
                </p>
                <div className="mt-2">
                <ul className="space-y-3">
                  {p.criteria.map((c) => {
                    const { Icon, label, note, text } = CRITERION[c.status]
                    return (
                      <li key={c.text}>
                        <Row icon={<Icon className={`size-4 ${text}`} />}>
                          <p className="wrap-anywhere">{c.text}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            <span className={`font-semibold ${text}`}>{label}</span> · {note}
                          </p>
                        </Row>
                      </li>
                    )
                  })}
                </ul>
                </div>
                </div>
              )}
            </Section>

            <Section title="Reaching out">
              {p.fit !== null && (
                <div className="mb-4 border-b border-rule pb-4">
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Opening
                  <InfoTip label="Opening" text={INFO.opening} />
                </p>
                <div className="mt-2">
                {p.opening && p.opening.freshness !== 'expired' ? (
                  <Row icon={<CheckCircle className="size-4 text-ok" />}>
                    <p className="text-[15px] font-medium wrap-anywhere">
                      {p.opening.summary} {p.opening.url && <XLink href={p.opening.url} label="Open the post on X" />}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="capitalize">{p.opening.type}</span> · {shortDate(p.opening.date)}
                      {p.opening.freshness === 'stale' && <span className="font-medium text-warn"> · over 30 days old, Review will warn</span>}
                    </p>
                  </Row>
                ) : (
                  <Row icon={<AlertTriangle className="size-4 text-warn" />}>
                    <p className="font-semibold">No recent post to open with</p>
                    {p.noOpening && <p className="mt-0.5 text-muted">{noOpeningText(p.noOpening)}</p>}
                    {p.noOpening?.cause === 'posts_not_read' && <p className="mt-0.5 text-muted">You can read them under Posts read.</p>}
                  </Row>
                )}
                </div>
                </div>
              )}
              <ul className="space-y-4">
                <LandRow icon={<Globe className="size-4 text-muted" />} label="Likely lands in" info={INFO.landsIn} value={p.landsIn ? LANDS_IN_LABEL[p.landsIn] : 'Unknown'} why={landsInWhy(p)} />
                <LandRow icon={<User className="size-4 text-muted" />} label="Relationship" info={INFO.relationship} value={RELATIONSHIP_LABEL[p.relationship]} why={RELATIONSHIP_WHY[p.relationship]} />
                {permission && <LandRow icon={<XLogo className="size-4 text-muted" />} label="Permission" info={INFO.permission} value={permission.label} why={permission.why} />}
              </ul>
            </Section>

            <Section title="Posts read" info={INFO.posts} aside={p.posts.length ? `${p.posts.length} read during the search` : undefined}>
              {/* Kept on screen once a read starts, so its result stays after the list fills in. */}
              {(p.posts.length === 0 || reading) && (
                <Row icon={<MinusCircle className="size-4 text-muted" />}>
                  {p.posts.length === 0 && <p className="text-muted">None read yet. The search reads up to 15 posts per person while the budget lasts.</p>}
                  <ReadPosts campaignId={campaignId} id={p.id} label="Read their posts" onStart={() => setReading(true)} />
                </Row>
              )}
              {p.posts.length > 0 && (
                <ol className="divide-y divide-rule">
                  {p.posts.map((post) => (
                    <li key={post.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="tabular-nums">{shortDate(post.date)}</span>
                        {post.opening && <span className={`${chip} ${tone.ok.chip}`}>Opening</span>}
                        {post.cited && <span className={`${chip} bg-rail text-ink`}>Cited in a reason</span>}
                        <span className="ml-auto"><XLink href={post.url} label="Open the post on X" /></span>
                      </div>
                      <p className="mt-1 line-clamp-4 text-sm wrap-anywhere">{post.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}
