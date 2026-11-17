import { Info } from './icons'

// A small (i) next to a label. Its title becomes the app's tooltip on hover, keyboard focus or a tap; the label says the same to a screen reader.
export default function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <button
      type="button"
      title={text}
      aria-label={`About ${label}: ${text}`}
      className="inline-grid size-5 shrink-0 place-items-center rounded-full align-middle text-muted transition-colors hover:text-ink focus-visible:text-ink"
    >
      <Info className="size-4" />
    </button>
  )
}
