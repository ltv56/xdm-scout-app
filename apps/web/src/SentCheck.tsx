import { useEffect, useRef, useState } from 'react'
import { Check, Close } from './icons'
import { btnSecondary } from './ui'

// One Sent? button. Asking opens a tick and a cross, so the answer is a second, deliberate click.
export default function SentCheck({ pending, onAnswer }: { pending: boolean; onAnswer: (outcome: 'sent' | 'not_sent') => void }) {
  const [open, setOpen] = useState(false)
  const group = useRef<HTMLSpanElement>(null)
  // The Sent? button is gone once asked, so keep the keyboard inside the answer; Escape closes it.
  useEffect(() => {
    if (open) group.current?.focus()
  }, [open])
  if (!open) {
    return (
      <button type="button" className={btnSecondary} onClick={() => setOpen(true)}>
        Sent?
      </button>
    )
  }
  const answer = 'grid size-8 place-items-center rounded-md transition hover:opacity-80 active:scale-95 disabled:opacity-50'
  return (
    <span ref={group} tabIndex={-1} role="group" aria-label="Was it sent?" className="anim-expand outline-none inline-flex items-center gap-1.5 rounded-lg bg-rail p-1" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button type="button" className="rounded-md px-2 py-1 text-sm font-medium hover:bg-rule" title="Close" aria-label="Close" onClick={() => setOpen(false)}>
        Sent?
      </button>
      <button type="button" className={`${answer} bg-ok-bg text-ok`} title="It was sent" aria-label="It was sent" disabled={pending} onClick={() => onAnswer('sent')}>
        <Check className="size-4" />
      </button>
      <button type="button" className={`${answer} bg-block-bg text-block`} title="It was not sent" aria-label="It was not sent" disabled={pending} onClick={() => onAnswer('not_sent')}>
        <Close className="size-4" />
      </button>
    </span>
  )
}
