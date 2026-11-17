export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// '17 Nov', the date style used across the app.
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// Small model costs keep two significant digits ($0.0004), so a cheap call does not read as $0.00.
export const usd = (micros: number) => (micros === 0 ? '$0' : `$${Number((micros / 1_000_000).toPrecision(2))}`)

// '17 Nov, 14:05', for sends and replies.
export const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const count = (n: number) => n.toLocaleString('en-US')

export const handle = (item: string) => item.replace(/^@/, '').toLowerCase()

export function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
