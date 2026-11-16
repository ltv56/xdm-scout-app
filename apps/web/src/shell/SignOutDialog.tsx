import { useEffect, useRef } from 'react'
import { btnPrimary, btnSecondary } from '../ui/ui'

// Signing out ends every session of this server, so it asks first.
export default function SignOutDialog({ pending, onConfirm, onClose }: { pending: boolean; onConfirm: () => void; onClose: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="sign-out-title" className="anim-pop w-full max-w-md rounded-2xl bg-raised p-6 shadow-pop">
        <h2 id="sign-out-title" className="text-lg font-semibold">
          Sign out on every device?
        </h2>
        <p className="mt-2 text-sm text-muted">This ends every session of this server, in this browser and anywhere else it is open. Sign in again with the password.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancel} type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={pending} onClick={onConfirm}>
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}
