// goTo is the page that has the buttons for the item; null when nothing in the app fixes it.
export type AttentionItem = {
  id: string
  kind: 'x_disconnected' | 'worker_stopped' | 'reply' | 'check' | 'failed' | 'outside_reply' | 'evidence_deleted' | 'budget_out'
  priority: 1 | 2 | 3
  title: string
  reason: string
  since: string | null
  goTo: 'inbox' | 'profile' | 'overview' | 'review' | null
}
