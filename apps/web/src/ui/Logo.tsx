// The app mark at small sizes (thicker ring, bigger tail): a message bubble with a target in it. The name always sits next to it, so it is hidden from screen readers.
export default function Logo({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" aria-hidden className={`shrink-0 text-ink ${className}`}>
      <path fill="currentColor" fillRule="evenodd" d="M47.6,186.8 A102 102 0 1 1 70.1,207.9 L18,238 Z M128 62a62 62 0 1 0 0 124 62 62 0 1 0 0-124Z M128 94a30 30 0 1 0 0 60 30 30 0 1 0 0-60Z" />
    </svg>
  )
}
