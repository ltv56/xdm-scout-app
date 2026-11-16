import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SenderProfile as Profile } from '../../../api/src/review/contract'
import { type XStatus } from '../settings/Account'
import { getJson, postJson } from '../api'
import { ChevronLeft, XLogo } from '../ui/icons'
import NewCampaign from '../campaign/NewCampaign'
import KeysSection from '../settings/KeysSection'
import { useXAppKeys } from '../settings/useXAppKeys'
import OnboardingTips from './OnboardingTips'
import QuickProfile from './QuickProfile'
import { btnApprove, btnLink, btnPrimary } from '../ui/ui'

type Step = 'connect' | 'profile' | 'campaign'
const ORDER: Step[] = ['connect', 'profile', 'campaign']

// The sender profile is complete when it has what drafts need: who you are, one program and who signs.
const profileDone = (p: Profile | undefined) => !!p && !!p.intro && p.programs.length > 0 && !!p.signer

function ConnectStep({ status, onContinue }: { status: XStatus | undefined; onContinue: () => void }) {
  const qc = useQueryClient()
  const useSandbox = useMutation({
    mutationFn: () => postJson('/auth/x/fake'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['x-status'] }),
  })
  const keys = useXAppKeys(status?.mode === 'live')
  if (!status || keys.loading) return <p role="status" className="text-sm text-muted">Checking…</p>
  const live = status.mode === 'live'
  return (
    <section aria-label="Connect">
      <h1 className="text-2xl font-bold">Connect the account that sends</h1>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">
        {live
          ? 'xdm-scout sends from your X account. It can only send replies to people who messaged it first. Everyone else you message yourself with Open in X.'
          : 'This copy runs on a fake X with example people and canned model answers. Nothing is sent.'}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <XLogo className="size-5" />
        {status.connected ? (
          <>
            <span className="text-sm font-semibold">Connected as @{status.handle}</span>
            <button type="button" className={btnApprove} onClick={onContinue}>
              Continue
            </button>
            {live && (
              <a className={btnLink} href="/api/auth/x/login">
                Reconnect X account
              </a>
            )}
          </>
        ) : live ? (
          keys.ready ? (
            <a className={btnPrimary} href="/api/auth/x/login">
              Connect X account
            </a>
          ) : (
            <span className="text-sm text-muted">Add your X app keys below first.</span>
          )
        ) : (
          <button type="button" className={btnPrimary} disabled={useSandbox.isPending} onClick={() => useSandbox.mutate()}>
            Use sandbox account
          </button>
        )}
      </div>
      {useSandbox.error && <p role="alert" className="mt-3 text-sm font-medium text-block">{useSandbox.error.message}</p>}
      {live && !status.connected && (
        <div className="mt-8">
          <h2 className="text-base font-semibold">Your keys</h2>
          <p className="mt-1 text-sm text-muted">Your own X app and OpenAI key, stored encrypted on this server. They can be changed later on Settings, Keys.</p>
          <KeysSection compact />
        </div>
      )}
    </section>
  )
}

// The first run: connect, say who you are, start a campaign. No menu until there is a campaign to look at.
export default function Onboarding({ onCreated }: { onCreated: (id: number) => void }) {
  const status = useQuery<XStatus>({ queryKey: ['x-status'], queryFn: () => getJson('/auth/x/status') })
  const profile = useQuery<Profile>({ queryKey: ['sender-profile'], queryFn: () => getJson('/sender-profile'), retry: false })
  // Going back shows an earlier step again without losing what is saved; it clears when that step is finished.
  const [back, setBack] = useState<Step | null>(null)
  const loading = status.isLoading || profile.isLoading
  const ahead: Step = !status.data?.connected ? 'connect' : !profileDone(profile.data) ? 'profile' : 'campaign'
  const step = back ?? ahead
  const n = ORDER.indexOf(step)
  // Which way the step moved, so it slides in from the right going on and from the left going back.
  const [seen, setSeen] = useState(n)
  const [direction, setDirection] = useState<'step-forward' | 'step-back'>('step-forward')
  if (n !== seen) {
    setSeen(n)
    setDirection(n > seen ? 'step-forward' : 'step-back')
  }
  const error = status.error ?? profile.error

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-[1280px] px-6 py-5">
        <span className="text-base font-bold tracking-tight text-ink">xdm-scout</span>
      </header>
      <main className={`mx-auto w-full max-w-[920px] px-6 ${step === 'connect' && !error && !loading ? 'flex flex-1 items-center justify-center pb-24' : 'pb-8 pt-2'}`}>
        {n > 0 && !error && !loading && (
          <button type="button" className={`${btnLink} mb-4 inline-flex items-center gap-1 no-underline`} onClick={() => setBack(ORDER[n - 1])}>
            <ChevronLeft className="size-4" />
            Back
          </button>
        )}
        <div className={`relative ${step === 'connect' ? 'w-full max-w-[680px]' : ''}`}>
        {/* Beside the card when there is room, a slim note above it on a laptop. */}
        {step !== 'connect' && <OnboardingTips className="mb-3 min-[1640px]:absolute min-[1640px]:left-full min-[1640px]:top-8 min-[1640px]:ml-6 min-[1640px]:mb-0 min-[1640px]:w-80" />}
        <div className="rounded-3xl bg-raised p-6 shadow-soft sm:p-8">
          {error ? (
            <p role="alert" className="text-sm font-medium text-block">Could not reach the API: {error.message}</p>
          ) : loading ? (
            <p role="status" className="text-sm text-muted">Checking…</p>
          ) : (
            <div key={step} data-step={step} className={direction}>
              <span className="mb-4 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">
                Step {n + 1} of {ORDER.length}
              </span>
              {step === 'connect' ? (
                <ConnectStep status={status.data} onContinue={() => setBack(null)} />
              ) : step === 'profile' ? (
                <section aria-label="Fund profile">
                  <h1 className="text-2xl font-bold">Tell us about the fund</h1>
                  <p className="mb-6 mt-1.5 text-sm text-muted">This is how a draft introduces you. <span className="text-block">*</span> required.</p>
                  <QuickProfile profile={profile.data!} onSaved={() => setBack(null)} />
                </section>
              ) : (
                <NewCampaign first wide onCancel={() => undefined} onCreated={onCreated} />
              )}
            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  )
}
