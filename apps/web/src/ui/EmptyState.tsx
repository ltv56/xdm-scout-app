import { btnSecondary } from './ui'

// One empty screen for the whole app: centred in the card, with a button to the next move when there is one.
export default function EmptyState({ title, text, action }: { title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <section aria-label={title} className="flex h-full min-h-[50vh] flex-col items-center justify-center px-5 py-8 text-center sm:px-12">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{text}</p>
      {action && (
        <button type="button" className={`${btnSecondary} mt-5`} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </section>
  )
}
