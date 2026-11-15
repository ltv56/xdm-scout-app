import { useEffect, useRef, useState } from 'react'
import type { CampaignSummary } from '../../api/src/review/contract'
import { Check, Close, Menu, Plus } from './icons'
import StatusStrip from './StatusStrip'

type Item = { id: string; label: string }

const row = 'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-base transition-colors hover:bg-rail'

// The top bar on a phone: the app name, where you are, and one button that opens everything else.
export default function MobileMenu({ sections, pages, tab, waiting, list, active, onSection, onPage, onSelect, onNew, apiDown }: {
  sections: Item[]
  pages: Item[]
  tab: string
  waiting: number
  list: CampaignSummary[]
  active: number | null
  onSection: (id: string) => void
  onPage: (id: string) => void
  onSelect: (id: number) => void
  onNew: () => void
  apiDown: boolean
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const here = [...sections, ...pages].find((s) => s.id === tab)?.label ?? ''

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  const choose = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }

  return (
    <header className="relative z-30 sm:hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-base font-bold tracking-tight text-ink">xdm-scout</span>
          <span className="truncate text-sm text-muted">{here}</span>
        </div>
        <div className="flex items-center gap-3">
          {apiDown && <span className="text-xs font-medium text-block">API unreachable</span>}
          <button
            ref={button}
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
            className="relative grid size-11 place-items-center rounded-xl transition-colors hover:bg-rail"
          >
            {open ? <Close className="size-6" /> : <Menu className="size-6" />}
            {!open && waiting > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-accent" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 top-[60px] bg-black/30" onClick={() => setOpen(false)} aria-hidden />
          <div id="mobile-menu" className="absolute inset-x-3 top-full max-h-[calc(100vh-80px)] overflow-y-auto rounded-3xl bg-raised p-3 shadow-pop">
            <div className="px-4 py-2">
              <StatusStrip campaignId={active} />
            </div>
            <nav aria-label="Sections" className="mt-1">
              {sections.map((s) => (
                <button key={s.id} type="button" aria-current={tab === s.id ? 'page' : undefined} className={`${row} ${tab === s.id ? 'bg-rail font-semibold' : ''}`} onClick={choose(() => onSection(s.id))}>
                  {s.label}
                  {s.id === 'review' && waiting > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">{waiting}</span>}
                </button>
              ))}
            </nav>
            <div className="mt-2 border-t border-rule pt-2">
              <p className="px-4 py-1 text-xs font-semibold text-muted">Campaign</p>
              {list.map((c) => (
                <button key={c.id} type="button" aria-current={c.id === active ? 'true' : undefined} className={row} onClick={choose(() => onSelect(c.id))}>
                  <span className="truncate">{c.name}</span>
                  {c.id === active && <Check className="size-4 shrink-0" />}
                </button>
              ))}
              <button type="button" className={row} onClick={choose(onNew)}>
                New campaign
                <Plus className="size-4" />
              </button>
            </div>
            <div className="mt-2 border-t border-rule pt-2">
              <p className="px-4 py-1 text-xs font-semibold text-muted">Account</p>
              {pages.map((p) => (
                <button key={p.id} type="button" aria-current={tab === p.id ? 'page' : undefined} className={`${row} ${tab === p.id ? 'bg-rail font-semibold' : ''}`} onClick={choose(() => onPage(p.id))}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </header>
  )
}
