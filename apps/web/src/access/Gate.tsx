import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { postJson, SIGNED_OUT_EVENT } from '../api'
import { btnPrimary, field } from '../ui/ui'
import { useAccess } from './useAccess'
import { onXConnected } from '../settings/connectX'


// On a hosted deploy (ACCESS_GATE=on) nothing but this screen shows until the owner signs in.
export default function Gate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const access = useAccess()

  // Any API call answered 401 (session ended elsewhere, or expired) brings this screen back.
  useEffect(() => {
    const onSignedOut = () => void qc.invalidateQueries({ queryKey: ['access'] })
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    const stop = onXConnected(() => void Promise.all(['x-status', 'preflight', 'keys'].map((key) => qc.invalidateQueries({ queryKey: [key] }))))
    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
      stop()
    }
  }, [qc])

  if (access.isLoading) return null
  if (!access.data?.gate || access.data.signedIn) return <>{children}</>
  return (
    <AccessScreen
      setUp={access.data.setUp}
      onDone={() => void qc.resetQueries()}
    />
  )
}

function AccessScreen({ setUp, onDone }: { setUp: boolean; onDone: () => void }) {
  const [invite, setInvite] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const submit = useMutation({
    mutationFn: () => (setUp ? postJson('/access/sign-in', { password }) : postJson('/access/set-up', { invite, password })),
    onSuccess: onDone,
  })

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <form
        aria-label={setUp ? 'Sign in' : 'Set up'}
        className="w-full max-w-md rounded-2xl bg-raised p-8 shadow-soft"
        onSubmit={(e) => {
          e.preventDefault()
          if (!setUp && password !== again) return setProblem('The two passwords are not the same.')
          if (!setUp && password.length < 12) return setProblem('Use a password of at least 12 characters.')
          setProblem(null)
          submit.mutate()
        }}
      >
        <p className="text-base font-bold tracking-tight">xdm-scout</p>
        <h1 className="mt-4 text-2xl font-bold">{setUp ? 'Sign in' : 'Set up this server'}</h1>
        <p className="mt-2 text-sm text-muted">
          {setUp
            ? 'This server belongs to one owner. Sign in with the password set when it was set up.'
            : 'Use the invite code you were sent and choose a password. The code works once: after this, only your password opens the app.'}
        </p>
        {!setUp && (
          <label className="mt-6 block text-sm font-medium">
            Invite code
            <input name="invite" className={`${field} mt-1`} value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" spellCheck={false} required />
          </label>
        )}
        <label className="mt-4 block text-sm font-medium">
          {setUp ? 'Password' : 'New password (at least 12 characters)'}
          <input type="password" name="password" className={`${field} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={setUp ? 'current-password' : 'new-password'} required autoFocus />
        </label>
        {!setUp && (
          <label className="mt-4 block text-sm font-medium">
            Password again
            <input type="password" name="password-again" className={`${field} mt-1`} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {(problem || submit.error) && (
          <p role="alert" className="mt-4 text-sm font-medium text-block">
            {problem ?? submit.error?.message}
          </p>
        )}
        <button type="submit" className={`${btnPrimary} mt-6 w-full`} disabled={submit.isPending}>
          {submit.isPending ? 'Checking…' : setUp ? 'Sign in' : 'Set up'}
        </button>
        <p className="mt-6 text-xs text-muted">Keys and X tokens are stored encrypted. Sign-ins and key changes are listed in Settings, Activity.</p>
      </form>
    </main>
  )
}
