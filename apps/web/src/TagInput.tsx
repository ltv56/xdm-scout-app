import { useId, useRef, useState, type ReactNode } from 'react'
import { field } from './ui'

// A list of short strings as removable tags. Enter or a comma adds one; pasted lines become one tag each.
export default function TagInput({ value, onChange, label, max, placeholder, normalize, labelClassName = 'text-sm font-medium', labelSuffix }: {
  value: string[]
  onChange: (next: string[]) => void
  label: string
  max?: number
  placeholder?: string
  normalize?: (item: string) => string
  labelClassName?: string
  labelSuffix?: ReactNode
}) {
  const id = useId()
  const box = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [dropped, setDropped] = useState(false)
  const full = max !== undefined && value.length >= max

  const add = (items: string[]) => {
    const next = [...value]
    let skipped = false
    for (const raw of items) {
      const item = normalize ? normalize(raw.trim()) : raw.trim()
      if (!item || next.includes(item)) continue
      if (max !== undefined && next.length >= max) {
        skipped = true
        continue
      }
      next.push(item)
    }
    if (next.length !== value.length) onChange(next)
    setDropped(skipped)
  }

  const remove = (item: string) => {
    onChange(value.filter((v) => v !== item))
    setDropped(false)
    box.current?.focus()
  }

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
        {labelSuffix}
      </label>
      <ul
        aria-label={`${label} (added)`}
        onClick={() => box.current?.focus()}
        className={`${field} mt-1 flex flex-wrap items-center gap-1.5 py-2! focus-within:border-ink/40 focus-within:ring-4 focus-within:ring-ink/10`}
      >
        {value.map((item) => (
          <li key={item} className="anim-pop flex max-w-full items-center gap-1 rounded-full bg-rail py-1 pl-3 pr-1.5 text-sm">
            <span className="min-w-0 break-words">{item}</span>
            <button type="button" aria-label={`Remove ${item}`} onClick={() => remove(item)} className="grid size-5 shrink-0 place-items-center rounded-full text-base leading-none text-muted transition-colors hover:bg-rule hover:text-ink">
              ×
            </button>
          </li>
        ))}
        <li role="presentation" className="min-w-32 flex-1">
          <input
            ref={box}
            id={id}
            value={draft}
            disabled={full}
            placeholder={value.length === 0 ? placeholder : undefined}
            onChange={(e) => {
              const parts = e.target.value.split(',')
              if (parts.length === 1) return setDraft(e.target.value)
              add(parts.slice(0, -1))
              setDraft(parts[parts.length - 1])
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add([draft])
                setDraft('')
              } else if (e.key === 'Backspace' && !draft && value.length > 0) {
                remove(value[value.length - 1])
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (!/[\n,]/.test(text)) return
              e.preventDefault()
              add(text.split(/[\n,]/))
            }}
            onBlur={() => {
              if (!draft.trim()) return
              add([draft])
              setDraft('')
            }}
            style={{ outline: 'none' }}
            className="w-full bg-transparent py-0.5 text-sm disabled:cursor-not-allowed"
          />
        </li>
      </ul>
      {dropped && (
        <p role="status" className="mt-1 text-xs font-medium text-warn">
          Up to {max} {label.toLowerCase()}.
        </p>
      )}
    </div>
  )
}
