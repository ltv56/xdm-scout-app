import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SenderProfile as Profile } from '../../api/src/review/contract'
import { putJson } from './api'
import { btnPrimary, field } from './ui'

const isLink = (s: string) => /^https?:\/\/\S+$/.test(s)
const area = `${field} field-sizing-content min-h-20`
const hint = 'mt-1.5 text-xs text-muted'

// The fund profile on a first run: only what a draft cannot be written without. The wording around the message, sample messages
// and more programs are in Profile later.
export default function QuickProfile({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const qc = useQueryClient()
  const first = profile.programs[0]
  const [intro, setIntro] = useState(profile.intro)
  const [name, setName] = useState(first?.name ?? '')
  const [description, setDescription] = useState(first?.description ?? '')
  const [link, setLink] = useState(first?.link ?? '')
  const [signer, setSigner] = useState(profile.signer)
  const [contact, setContact] = useState(profile.frame?.contactLine ?? '')
  const [missing, setMissing] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      putJson<Profile>('/sender-profile', {
        ...profile,
        intro: intro.trim(),
        programs: [{ id: first?.id ?? 1, name: name.trim(), description: description.trim(), link: link.trim(), deadline: first?.deadline ?? null }, ...profile.programs.slice(1)],
        signer: signer.trim(),
        frame: { greeting: profile.frame?.greeting ?? null, optOut: profile.frame?.optOut ?? null, contactLine: contact.trim() || null },
      }),
    onSuccess: (saved) => {
      qc.setQueryData(['sender-profile'], saved)
      onSaved()
    },
  })

  const submit = () => {
    const gap = !intro.trim()
      ? 'Say who you are.'
      : !name.trim() || !description.trim()
        ? 'Give the program a name and one sentence.'
        : !isLink(link.trim())
          ? 'Give the program a link that starts with https://.'
          : !signer.trim()
            ? 'Say who signs the message.'
            : null
    setMissing(gap)
    if (!gap) save.mutate()
  }

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
        <div>
          <label htmlFor="intro" className="text-sm font-semibold">
            Who you are<span aria-hidden className="ml-0.5 text-block">*</span>
          </label>
          <textarea
            id="intro"
            rows={3}
            maxLength={400}
            value={intro}
            placeholder="I'm on the team at GenAI Fund. We back builders of AI agents in Southeast Asia."
           
            onChange={(e) => setIntro(e.target.value)}
            className={`${area} mt-1.5`}
          />
          <p className={hint}>One or two sentences.</p>
        </div>

        <div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="p-name" className="text-sm font-semibold">
                What you offer<span aria-hidden className="ml-0.5 text-block">*</span>
              </label>
              <input id="p-name" value={name} maxLength={80} placeholder="FastTrack AI Accelerator" onChange={(e) => setName(e.target.value)} className={`${field} mt-1.5`} />
            </div>
            <div>
              <label htmlFor="p-link" className="text-sm font-semibold">
                Link<span aria-hidden className="ml-0.5 text-block">*</span>
              </label>
              <input id="p-link" type="url" inputMode="url" value={link} maxLength={300} placeholder="https://genaifund.ai/" onChange={(e) => setLink(e.target.value)} className={`${field} mt-1.5`} />
            </div>
          </div>
          <label htmlFor="p-desc" className="mt-5 block text-sm font-semibold">
            One sentence about it<span aria-hidden className="ml-0.5 text-block">*</span>
          </label>
          <textarea
            id="p-desc"
            rows={2}
            maxLength={200}
            value={description}
            placeholder="GPU credits and technical experts for early AI startups."
           
            onChange={(e) => setDescription(e.target.value)}
            className={`${area} mt-1.5 min-h-16`}
          />
          <p className={hint}>You can add more programs in Profile later.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="signer" className="text-sm font-semibold">
              Who signs the message<span aria-hidden className="ml-0.5 text-block">*</span>
            </label>
            <input id="signer" value={signer} maxLength={64} placeholder="Linh at GenAI Fund" onChange={(e) => setSigner(e.target.value)} className={`${field} mt-1.5`} />
            <p className={hint}>The name at the end of each message.</p>
          </div>
          <div>
            <label htmlFor="contact" className="text-sm font-semibold">
              Contact line <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="contact" value={contact} maxLength={160} placeholder="Write to me at name@example.com" onChange={(e) => setContact(e.target.value)} className={`${field} mt-1.5`} />
            <p className={hint}>Goes last in every message, so they can reach you elsewhere.</p>
          </div>
        </div>

        {missing && (
          <p role="alert" className="text-sm font-medium text-block">
            {missing}
          </p>
        )}
        {save.error && (
          <p role="alert" className="text-sm font-medium text-block">
            {save.error.message}
          </p>
        )}
        <button type="submit" disabled={save.isPending} className={btnPrimary}>
          Save and continue
        </button>

    </form>
  )
}
