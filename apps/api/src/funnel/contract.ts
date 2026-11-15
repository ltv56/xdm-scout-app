// Counts and money only. goodFit = Strong or Possible; approved = a reviewer approved a draft. A conversation is a reply of class Interested or Question.
export type FunnelLane = {
  lane: 'search' | 'call'
  found: number
  goodFit: number
  approved: number
  sent: number
  replied: number
  conversations: number
  // What X billed for this lane; the model's cost is separate.
  costMicros: number
  llmCostMicros: number
  // Some model calls of this lane had no price, so llmCostMicros is a lower bound.
  llmUnpriced: boolean
  costPerConversationMicros: number | null
}

// totalMicros = X cost + model cost of the whole campaign; llmMicros is the model part.
export type Funnel = { lanes: FunnelLane[]; totalMicros: number; llmMicros: number; llmUnpriced: boolean }
