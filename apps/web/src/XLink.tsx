import { XLogo } from './icons'

// A link that opens something on X: the post or the profile it came from. The name says which.
export default function XLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className="inline-grid size-6 place-items-center rounded-md align-middle text-muted transition-colors hover:bg-rail hover:text-ink">
      <XLogo className="size-3.5" />
    </a>
  )
}

// A person's name or handle that opens their profile on X; only outside buttons and menus.
export function ProfileLink({ handle, className = '', children }: { handle: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={`https://x.com/${handle}`} target="_blank" rel="noreferrer" title={`Open @${handle} on X`} className={`underline-offset-4 hover:underline ${className}`}>
      {children}
    </a>
  )
}
