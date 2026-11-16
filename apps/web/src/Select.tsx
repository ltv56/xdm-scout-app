import { Children, isValidElement, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown } from './icons'
import { field } from './ui'

interface Option {
  value: string
  label: ReactNode
}

// The <option> children, however they are nested in arrays, fragments or conditions.
function collect(children: ReactNode, out: Option[] = []): Option[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    const props = c.props as { value?: string | number; children?: ReactNode }
    if (c.type === 'option') out.push({ value: String(props.value ?? ''), label: props.children })
    else if (props.children) collect(props.children, out)
  })
  return out
}

// A dropdown drawn by the app: the closed box and the list. It is a combobox with a listbox, so the keyboard
// (arrows, Home, End, Enter, Escape) and screen readers work. Give it <option> children, as for a native select.
// wrapperClassName places it in the layout; className is for the box.
export default function Select({
  value,
  onChange,
  children,
  wrapperClassName = '',
  className = '',
  id,
  disabled,
}: {
  value: string | number
  onChange?: (e: { target: { value: string } }) => void
  children: ReactNode
  wrapperClassName?: string
  className?: string
  id?: string
  disabled?: boolean
}) {
  const options = collect(children)
  const current = String(value ?? '')
  const selected = options.findIndex((o) => o.value === current)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const box = useRef<HTMLSpanElement>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) box.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const choose = (i: number) => {
    onChange?.({ target: { value: options[i].value } })
    setOpen(false)
  }
  const show = () => {
    setActive(Math.max(0, selected))
    setOpen(true)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const last = options.length - 1
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return show()
      setActive((a) => Math.min(last, Math.max(0, a + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (open && (e.key === 'Home' || e.key === 'End')) {
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : last)
    } else if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      handled.current = true
      choose(active)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <span ref={box} className={`relative inline-block ${wrapperClassName}`}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => {
          if (handled.current) {
            handled.current = false
            return
          }
          if (open) setOpen(false)
          else show()
        }}
        onKeyDown={onKeyDown}
        className={`${field} flex cursor-pointer items-center justify-between gap-2 text-left transition-colors hover:border-ink/30 focus:outline-none focus-visible:border-ink/40 focus-visible:ring-4 focus-visible:ring-ink/10 disabled:cursor-not-allowed disabled:text-muted ${className}`}
      >
        <span className="min-w-0 truncate">{options[selected]?.label}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul id={listId} role="listbox" onClick={(e) => e.preventDefault()} className="anim-pop absolute left-0 top-full z-30 mt-1.5 max-h-64 w-max min-w-full max-w-[min(22rem,90vw)] origin-top-left overflow-auto rounded-xl border border-rule bg-raised p-1 shadow-pop">
          {options.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              id={`${listId}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-rail' : ''} ${i === selected ? 'font-semibold' : ''}`}
            >
              <span className="min-w-0">{o.label}</span>
              {i === selected && <Check className="size-4 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
