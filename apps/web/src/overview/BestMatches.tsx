import { useRef } from 'react'
import FitBadge from '../candidates/FitBadge'
import type { Prospect } from '../candidates/Prospects'
import { ago } from '../format'
import { ChevronLeft, ChevronRight } from '../ui/icons'
import { ProfileLink } from '../ui/XLink'

// Strong and possible people as a sideways row of cards; the arrows move one card.
export default function BestMatches({ people }: { people: Prospect[] }) {
  const row = useRef<HTMLUListElement>(null)
  const move = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * 336, behavior: 'smooth' })
  const arrow = 'grid size-8 place-items-center rounded-full bg-raised shadow-soft transition hover:bg-rail'
  return (
    <section aria-label="Best matches" className="mt-10 rounded-2xl bg-paper px-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">Best matches and why</h2>
        {people.length > 2 && (
          <div className="flex gap-2">
            <button type="button" className={arrow} aria-label="Previous" onClick={() => move(-1)}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className={arrow} aria-label="Next" onClick={() => move(1)}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
      <ul ref={row} tabIndex={0} aria-label="Best matches, scroll sideways" className="scroll-thin mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {people.map((p) => (
          <li key={p.id} className="w-80 shrink-0 snap-start rounded-xl bg-raised p-4 shadow-soft">
            <FitBadge fit={p.fit} />
            <p className="mt-2 min-w-0 font-semibold wrap-anywhere">
              <ProfileLink handle={p.handle}>
                {p.name} <span className="text-sm font-normal text-muted">@{p.handle}</span>
              </ProfileLink>
            </p>
            {p.role && p.role !== 'other' && <p className="text-sm text-muted">{p.role}</p>}
            <p className="mt-2 line-clamp-3 text-sm">
              {p.opening?.summary ?? <span className="text-muted">No reason to reach out yet</span>}
            </p>
            {p.opening && <p className="mt-1 text-xs text-muted">{ago(p.opening.date)}{p.opening.freshness === 'stale' ? ' (stale)' : ''}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
