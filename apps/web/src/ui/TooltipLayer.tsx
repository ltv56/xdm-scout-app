import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// One tooltip for the whole app. Anything with a title attribute gets the app's own bubble instead of the browser's:
// the title is taken off while the pointer or focus is there (so the browser shows nothing) and put back on leaving.
export default function TooltipLayer() {
  const id = useId()
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const bubble = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const held = new Map<Element, string>()
    let target: Element | null = null
    let timer = 0
    let showing = false

    const hide = () => {
      window.clearTimeout(timer)
      showing = false
      setTip(null)
      setPos(null)
    }
    const leave = () => {
      hide()
      for (const [el, text] of held) {
        el.setAttribute('title', text)
        el.removeAttribute('aria-describedby')
      }
      held.clear()
      target = null
    }
    const owner = (from: EventTarget | null) => {
      for (let n = from as Element | null; n && n.nodeType === 1; n = n.parentElement) if (held.has(n) || n.hasAttribute('title')) return n
      return null
    }
    const enter = (e: Event) => {
      const el = owner(e.target)
      if (!el || el === target) return
      leave()
      const text = el.getAttribute('title')?.trim()
      if (!text) return
      el.removeAttribute('title')
      held.set(el, text)
      target = el
      timer = window.setTimeout(() => {
        el.setAttribute('aria-describedby', id)
        showing = true
        setTip({ text, rect: el.getBoundingClientRect() })
      }, 300)
    }
    const out = (e: Event) => {
      const next = (e as MouseEvent).relatedTarget as Node | null
      if (target && next && target.contains(next)) return
      leave()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide()

    document.addEventListener('mouseover', enter)
    document.addEventListener('focusin', enter)
    document.addEventListener('mouseout', out)
    document.addEventListener('focusout', leave)
    document.addEventListener('pointerdown', hide)
    document.addEventListener('keydown', onKey)
    // Scrolling moves what the bubble points at, so a bubble that is up goes; one still waiting its turn is placed when it fires.
    const onScroll = () => showing && hide()
    window.addEventListener('scroll', onScroll, true)
    return () => {
      leave()
      document.removeEventListener('mouseover', enter)
      document.removeEventListener('focusin', enter)
      document.removeEventListener('mouseout', out)
      document.removeEventListener('focusout', leave)
      document.removeEventListener('pointerdown', hide)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [id])

  // Above the element, or below it when there is no room; kept inside the window.
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return
    const b = bubble.current.getBoundingClientRect()
    const left = Math.min(Math.max(8, tip.rect.left + tip.rect.width / 2 - b.width / 2), window.innerWidth - b.width - 8)
    const above = tip.rect.top - b.height - 8
    setPos({ left, top: above >= 8 ? above : tip.rect.bottom + 8 })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={bubble}
      id={id}
      role="tooltip"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="anim-pop pointer-events-none fixed z-50 w-max max-w-[260px] whitespace-pre-line rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug text-white shadow-pop"
    >
      {tip.text}
    </div>,
    document.body,
  )
}
