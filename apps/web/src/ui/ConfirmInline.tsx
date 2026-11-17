import { useEffect, useRef, useState } from 'react'
import { Check, Close } from './icons'
import Spinner from './Spinner'

interface Props {
  label: string
  question: string
  confirmLabel: string
  pending: boolean
  onConfirm: () => void
  className: string
  title?: string
}

// A button that asks once, in place, with a tick and a cross, before an action that undoes something.
// Escape or the cross leaves things as they were; screen readers hear the question and both button names.
export default function ConfirmInline({ label, question, confirmLabel, pending, onConfirm, className, title }: Props) {
  const [asking, setAsking] = useState(false)
  const yes = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (asking) yes.current?.focus()
  }, [asking])

  if (!asking) {
    return (
      <button type="button" className={className} title={title} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  const icon = 'grid size-7 place-items-center rounded-full transition-colors disabled:opacity-60'
  return (
    <span
      role="group"
      aria-label={question}
      className="anim-pop inline-flex items-center gap-1 rounded-full bg-warn-bg py-0.5 pl-3 pr-0.5 text-sm font-medium"
      onKeyDown={(e) => e.key === 'Escape' && setAsking(false)}
    >
      {label}
      <button ref={yes} type="button" aria-label={confirmLabel} title={confirmLabel} className={`${icon} ml-1 bg-ok text-white hover:opacity-90`} disabled={pending} onClick={onConfirm}>
        {pending ? <Spinner className="size-3.5" /> : <Check className="size-4" />}
      </button>
      <button type="button" aria-label="Cancel" title="Cancel" className={`${icon} bg-block-bg text-block hover:bg-block hover:text-white`} onClick={() => setAsking(false)}>
        <Close className="size-4" />
      </button>
    </span>
  )
}
