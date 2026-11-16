import { useRef, type ReactNode } from 'react'

// A row of tabs with a panel under it. Arrow keys move between the tabs.
export default function Tabs<T extends string>({ label, tabs, value, onChange, children }: { label: string; tabs: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void; children: ReactNode }) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  const slug = label.toLowerCase().replace(/\W+/g, '-')

  const move = (e: React.KeyboardEvent, from: number) => {
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    e.preventDefault()
    const next = tabs[(from + by + tabs.length) % tabs.length]
    onChange(next.id)
    buttons.current[next.id]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-6 gap-y-2 border-b border-rule">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${slug}-tab-${t.id}`}
            aria-selected={value === t.id}
            aria-controls={`${slug}-panel`}
            tabIndex={value === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => move(e, i)}
            className={`relative -mb-px border-b-2 py-2.5 text-sm transition-colors ${value === t.id ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={value} role="tabpanel" id={`${slug}-panel`} aria-labelledby={`${slug}-tab-${value}`} className="anim-fade-up pt-8">
        {children}
      </div>
    </div>
  )
}
