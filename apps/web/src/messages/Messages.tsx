import { useRef } from 'react'
import Inbox from './Inbox'
import Outbox from './Outbox'

const MESSAGE_TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'outbox', label: 'Outbox' },
] as const
export type MessagesTab = (typeof MESSAGE_TABS)[number]['id']

// Inbox and Outbox under one menu item. Fills the panel it is placed in.
export default function Messages({ campaignId, tab, onTab, onReview }: { campaignId: number; tab: MessagesTab; onTab: (tab: MessagesTab) => void; onReview: () => void }) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})

  const move = (e: React.KeyboardEvent, from: number) => {
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    e.preventDefault()
    const next = MESSAGE_TABS[(from + by + MESSAGE_TABS.length) % MESSAGE_TABS.length]
    onTab(next.id)
    buttons.current[next.id]?.focus()
  }

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Messages" className="flex shrink-0 gap-6 px-5 pt-6 sm:px-12 sm:pt-8">
        {MESSAGE_TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`messages-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="messages-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => move(e, i)}
            className={`relative py-1 text-sm transition-colors ${tab === t.id ? 'font-semibold text-ink after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="messages-panel" aria-labelledby={`messages-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-12 sm:py-10">
        {tab === 'inbox' ? <Inbox campaignId={campaignId} onReview={onReview} /> : <Outbox campaignId={campaignId} onReview={onReview} />}
      </div>
    </div>
  )
}
