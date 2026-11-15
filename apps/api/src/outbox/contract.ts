export type OutboxItem = {
  attemptId: number
  handle: string
  label: 'Waiting to send' | 'Sending' | 'Checking' | 'Sent' | 'Send in X' | 'Check in X' | 'Failed' | 'Cancelled'
  route: 'api' | 'manual'
  error: string | null
  at: string
}

// inFlight: something is still moving, so the page polls faster.
export type Outbox = { inFlight: boolean; items: OutboxItem[] }
