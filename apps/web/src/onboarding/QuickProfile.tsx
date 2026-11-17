import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SenderProfile as Profile } from '../../../api/src/review/contract'
import { putJson } from '../api'
import { btnPrimary, field } from '../ui/ui'

const isLink = (s: string) => /^https?:\/\/\S+$/.test(s)
const area = `${field} field-sizing-content min-h-20`
const hint = 'mt-1.5 text-xs text-muted'
const FIELDS = ['intro', 'p-name', 'p-link', 'p-desc', 'signer'] as const
type Field = (typeof FIELDS)[number]
type Errors = Partial<Record<Field, string>>

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
  const [errors, setErrors] = useState<Errors>({})

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
    const found: Errors = {}
    if (!intro.trim()) found.intro = 'Say who you are.'
    if (!name.trim()) found['p-name'] = 'Name the program.'
    if (!isLink(link.trim())) found['p-link'] = 'A link that starts with https://.'
    if (!description.trim()) found['p-desc'] = 'One sentence about the program.'
    if (!signer.trim()) found.signer = 'Say who signs the message.'
    setErrors(found)
    const firstGap = FIELDS.find((id) => found[id])
    if (firstGap) document.getElementById(firstGap)?.focus()
    else save.mutate()
  }

  const invalid = (id: Field) => (errors[id] ? { 'aria-invalid': true, 'aria-describedby': `${id}-err` } : {})
  const below = (id: Field, text: string) =>
    errors[id] ? (
      <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-block">
        {errors[id]}
      </p>
    ) : (
      text && <p className={hint}>{text}</p>
    )
  const gaps = Object.keys(errors).length

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
            placeholder="e.g. I'm on the team at GenAI Fund. We back builders of AI agents in Southeast Asia."
            onChange={(e) => setIntro(e.target.value)}
            className={`${area} mt-1.5`}
            {...invalid('intro')}
          />
          {below('intro', 'One or two sentences.')}
        </div>

        <div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="p-name" className="text-sm font-semibold">
                What you offer<span aria-hidden className="ml-0.5 text-block">*</span>
              </label>
              <input id="p-name" value={name} maxLength={80} placeholder="e.g. FastTrack AI Accelerator" onChange={(e) => setName(e.target.value)} className={`${field} mt-1.5`} {...invalid('p-name')} />
              {below('p-name', '')}
            </div>
            <div>
              <label htmlFor="p-link" className="text-sm font-semibold">
                Link<span aria-hidden className="ml-0.5 text-block">*</span>
              </label>
              <input id="p-link" type="url" inputMode="url" value={link} maxLength={300} placeholder="e.g. https://genaifund.ai/" onChange={(e) => setLink(e.target.value)} className={`${field} mt-1.5`} {...invalid('p-link')} />
              {below('p-link', '')}
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
            placeholder="e.g. GPU credits and technical experts for early AI startups."
            onChange={(e) => setDescription(e.target.value)}
            className={`${area} mt-1.5 min-h-16`}
            {...invalid('p-desc')}
          />
          {below('p-desc', 'You can add more programs in Profile later.')}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="signer" className="text-sm font-semibold">
              Who signs the message<span aria-hidden className="ml-0.5 text-block">*</span>
            </label>
            <input id="signer" value={signer} maxLength={64} placeholder="e.g. Linh at GenAI Fund" onChange={(e) => setSigner(e.target.value)} className={`${field} mt-1.5`} {...invalid('signer')} />
            {below('signer', 'The name at the end of each message.')}
          </div>
          <div>
            <label htmlFor="contact" className="text-sm font-semibold">
              Contact line <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="contact" value={contact} maxLength={160} placeholder="e.g. Write to me at name@example.com" onChange={(e) => setContact(e.target.value)} className={`${field} mt-1.5`} />
            <p className={hint}>Goes last in every message, so they can reach you elsewhere.</p>
          </div>
        </div>

        {gaps > 0 && (
          <p role="alert" className="text-sm font-medium text-block">
            Fill in the {gaps === 1 ? 'field' : `${gaps} fields`} marked in red.
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
