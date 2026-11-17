import { useEffect, useState } from 'react'

// Things about the whole app, all of them true of how it works now. Nothing about how X itself works. One at a time.
const TIPS = [
  { title: 'Did you know?', body: 'Every sentence of a draft shows where it comes from: a post, your profile, or no source at all.' },
  { title: 'Good to know', body: 'xdm-scout can only reply to people who messaged you first. Everyone else you message yourself with Open in X.' },
  { title: 'Did you know?', body: 'Each candidate shows how many posts the app read, so you can see how sure it is.' },
  { title: 'Did you know?', body: 'Costs and the daily send cap are in Settings. The top bar warns you when the cap is close.' },
  { title: 'Did you know?', body: 'Nothing is sent until a person approves that exact text.' },
]

const EVERY_MS = 7000

// A note in the empty space beside the card.
export default function OnboardingTips({ className = '', start = 0 }: { className?: string; start?: number }) {
  const [at, setAt] = useState(start % TIPS.length)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setAt((n) => (n + 1) % TIPS.length), EVERY_MS)
    return () => clearInterval(timer)
  }, [])

  const tip = TIPS[at]
  return (
    <aside aria-label="Tip" className={className}>
      <div className="rounded-2xl bg-accent px-5 py-3 text-accent-ink min-[1640px]:rounded-3xl min-[1640px]:px-7 min-[1640px]:py-6">
        <div key={at} className="tip-in">
          <p className="text-sm font-semibold min-[1640px]:text-base">{tip.title}</p>
          <p className="mt-0.5 text-sm leading-snug opacity-90 min-[1640px]:mt-2 min-[1640px]:text-base">{tip.body}</p>
        </div>
      </div>
    </aside>
  )
}
