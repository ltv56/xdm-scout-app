import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SenderProfile as Profile } from '../../api/src/review/contract'
import { type XStatus } from './Account'
import { getJson, postJson } from './api'
import { XLogo } from './icons'
import NewCampaign from './NewCampaign'
import SenderProfile from './SenderProfile'
import { btnPrimary } from './ui'

const STEPS = [
  { id: 'connect', label: 'Connect' },
  { id: 'profile', label: 'Fund profile' },
  { id: 'campaign', label: 'First campaign' },
] as const
type Step = (typeof STEPS)[number]['id']

// The sender profile is complete when it has what drafts need: who you are, one program and who signs.
const profileDone = (p: Profile | undefined) => !!p && !!p.intro && p.programs.length > 0 && !!p.signer

function ConnectStep({ status }: { status: XStatus | undefined }) {
  const qc = useQueryClient()
  const useSandbox = useMutation({
    mutationFn: () => postJson('/auth/x/fake'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['x-status'] }),
  })
  if (!status) return <p role="status" className="text-sm text-muted">Checking…</p>
  const live = status.mode === 'live'
  return (
    <section aria-label="Connect">
      <h1 className="text-2xl font-bold">Connect the account that sends</h1>
      <p className="mt-2 text-sm text-muted">
        {live
          ? 'xdm-scout sends from your X account. It can only send replies to people who messaged it first. Everyone else you message yourself with Open in X.'
          : 'This copy runs on a fake X with example people and canned model answers. Nothing is sent.'}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <XLogo className="size-5" />
        {live ? (
          <a className={btnPrimary} href="/api/auth/x/login">
            Connect X account
          </a>
        ) : (
          <button type="button" className={btnPrimary} disabled={useSandbox.isPending} onClick={() => useSandbox.mutate()}>
            Use sandbox account
          </button>
        )}
      </div>
      {useSandbox.error && <p role="alert" className="mt-3 text-sm font-medium text-block">{useSandbox.error.message}</p>}
    </section>
  )
}

// The first run: connect, say who you are, start a campaign. No menu until there is a campaign to look at.
export default function Onboarding({ onCreated }: { onCreated: (id: number) => void }) {
  const status = useQuery<XStatus>({ queryKey: ['x-status'], queryFn: () => getJson('/auth/x/status') })
  const profile = useQuery<Profile>({ queryKey: ['sender-profile'], queryFn: () => getJson('/sender-profile'), retry: false })
  const loading = status.isLoading || profile.isLoading
  const step: Step = !status.data?.connected ? 'connect' : !profileDone(profile.data) ? 'profile' : 'campaign'
  const current = STEPS.findIndex((s) => s.id === step)
  const error = status.error ?? profile.error

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-10">
      <span className="text-base font-bold tracking-tight text-ink">xdm-scout</span>
      <ol aria-label="Setup steps" className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {STEPS.map((s, n) => (
          <li key={s.id} aria-current={n === current ? 'step' : undefined} className={n === current ? 'font-semibold text-ink' : 'text-muted'}>
            {n + 1}. {s.label}
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-3xl bg-raised p-6 shadow-soft sm:p-10">
        {error ? (
          <p role="alert" className="text-sm font-medium text-block">Could not reach the API: {error.message}</p>
        ) : loading ? (
          <p role="status" className="text-sm text-muted">Checking…</p>
        ) : step === 'connect' ? (
          <ConnectStep status={status.data} />
        ) : step === 'profile' ? (
          <section aria-label="Fund profile">
            <h1 className="text-2xl font-bold">Tell us about the fund</h1>
            <p className="mb-6 mt-2 text-sm text-muted">Drafts may only say what is written here, or what the person wrote in their own posts.</p>
            <SenderProfile />
          </section>
        ) : (
          <NewCampaign first onCancel={() => undefined} onCreated={onCreated} />
        )}
      </div>
    </div>
  )
}
