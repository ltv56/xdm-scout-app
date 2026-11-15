// Counts and money only. goodFit = Strong or Possible; approved = a reviewer approved a draft. A conversation is a reply of class Interested or Question.
export type FunnelLane = {
  lane: 'search' | 'call'
  found: number
  goodFit: number
  approved: number
  sent: number
  replied: number
  conversations: number
  costMicros: number
  costPerConversationMicros: number | null
}

export type Funnel = { lanes: FunnelLane[]; totalMicros: number }
