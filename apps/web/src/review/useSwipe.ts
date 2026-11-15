import { useRef, useState } from 'react'

const SIDE = 80
const UP_DOWN = 90

type Swipe = { enabled: boolean; onLeft: () => void; onRight: () => void; onUp: () => void; onDown: () => void }

const atTop = () => window.scrollY <= 2
const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4

// Phone gestures on a draft: sideways to skip or go back, and up or down for the next or previous draft. Up and down only count
// when the page was already at its end and did not scroll, so reading a long draft is never mistaken for a swipe.
export function useSwipe({ enabled, onLeft, onRight, onUp, onDown }: Swipe) {
  const start = useRef<{ x: number; y: number; top: boolean; bottom: boolean } | null>(null)
  const [offset, setOffset] = useState(0)

  const ignore = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest('input, textarea, select, dialog, [data-no-swipe]')

  return {
    offset,
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        if (!enabled || e.touches.length !== 1 || ignore(e.target)) return
        const t = e.touches[0]
        start.current = { x: t.clientX, y: t.clientY, top: atTop(), bottom: atBottom() }
      },
      onTouchMove: (e: React.TouchEvent) => {
        const s = start.current
        if (!s) return
        const dx = e.touches[0].clientX - s.x
        const dy = e.touches[0].clientY - s.y
        setOffset(Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5 ? Math.max(-70, Math.min(70, dx)) : 0)
      },
      onTouchEnd: (e: React.TouchEvent) => {
        const s = start.current
        start.current = null
        setOffset(0)
        if (!s) return
        const t = e.changedTouches[0]
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        if (Math.abs(dx) >= SIDE && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? onLeft() : onRight()
        if (Math.abs(dy) >= UP_DOWN && Math.abs(dy) > Math.abs(dx) * 1.5) {
          if (dy < 0 && s.bottom && atBottom()) onUp()
          else if (dy > 0 && s.top && atTop()) onDown()
        }
      },
      onTouchCancel: () => {
        start.current = null
        setOffset(0)
      },
    },
  }
}
