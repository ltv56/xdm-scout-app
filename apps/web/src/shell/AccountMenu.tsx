import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccess } from '../access/useAccess'
import { postJson } from '../api'
import SignOutDialog from './SignOutDialog'

// The avatar opens Profile (who sends and signs) and Settings (is the system ready).
export default function AccountMenu({ current, onSelect, children }: {
  current: 'profile' | 'settings' | 'activity' | null
  onSelect: (page: 'profile' | 'settings' | 'activity') => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  // Sign-out shows only on a deploy with the sign-in gate.
  const access = useAccess()
  const [confirmOut, setConfirmOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  // One owner, one way out: signing out ends every session, so a forgotten browser cannot stay signed in.
  const signOut = () => {
    setSigningOut(true)
    void postJson('/access/sign-out-everywhere').finally(() => void qc.resetQueries())
  }
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const row = 'flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-rail'

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Account"
        title="Account"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink transition-shadow hover:bg-accent-hover ${current ? 'ring-2 ring-accent ring-offset-2 ring-offset-paper' : ''}`}
      >
        {children}
      </button>
      {open && (
        <ul aria-label="Account menu" className="anim-pop absolute right-0 top-full z-30 mt-2 w-44 origin-top-right rounded-2xl bg-raised p-1.5 shadow-pop">
          {(['profile', 'settings', 'activity'] as const).map((page) => (
            <li key={page}>
              <button
                type="button"
                autoFocus={page === current}
                aria-current={page === current ? 'page' : undefined}
                className={`${row} ${page === current ? 'bg-rail font-semibold' : ''}`}
                onClick={() => {
                  onSelect(page)
                  setOpen(false)
                }}
              >
                {page === 'profile' ? 'Profile' : page === 'settings' ? 'Settings' : 'Activity log'}
              </button>
            </li>
          ))}
          {access.data?.gate && (
            <>
              <li aria-hidden="true" className="my-1 border-t border-rule" />
              <li>
                <button
                  type="button"
                  className={row}
                  onClick={() => {
                    setOpen(false)
                    setConfirmOut(true)
                  }}
                >
                  Sign out
                </button>
              </li>
            </>
          )}
        </ul>
      )}
      {confirmOut && <SignOutDialog pending={signingOut} onConfirm={signOut} onClose={() => setConfirmOut(false)} />}
    </div>
  )
}
