// Counts and money only. A conversation is a reply of class Interested or Question.
export type FunnelLane = {
  lane: 'search' | 'call'
  found: number
  drafted: number
  sent: number
  replied: number
  conversations: number
  costMicros: number
  costPerConversationMicros: number | null
}

export type Funnel = { lanes: FunnelLane[]; totalMicros: number }
