// A small turning ring in the text colour. It stands still when the system asks for less motion.
export default function Spinner({ className = 'size-4' }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none ${className}`} />
}
