import type { ReplyClass } from '../inbox/reply-class'

export type OutboxItem = {
  attemptId: number
  // The draft behind the send, for "I sent it" on a hand-off.
  draftId: number
  handle: string
  name: string | null
  // The first line after the greeting, so a row says what was sent.
  preview: string
  reply: ReplyClass | null
  label: 'Waiting to send' | 'Sending' | 'Checking' | 'Sent' | 'Send in X' | 'Did you send it?' | 'Sent by hand' | 'Check in X' | 'Failed' | 'Cancelled'
  route: 'api' | 'manual'
  error: string | null
  at: string
  // Only for a hand-off waiting for the operator: the link that opens X with the draft, and the text to copy.
  openInX: string | null
  text: string | null
}

// inFlight: something is still moving, so the page polls faster.
export type Outbox = { inFlight: boolean; items: OutboxItem[] }
