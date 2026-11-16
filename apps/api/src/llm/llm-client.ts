// Which campaign and lane a call is paid for; the lane is that of the person it is about.
export type LlmMeter = { campaignId: number; lane: 'search' | 'call' }

// onUsage: the token counts of this one call, for a caller that reports them on screen.
export type LlmRequest = {
  task: 'fit' | 'verify' | 'draft' | 'decide' | 'translate' | 'reply' | 'handles'
  system: string
  user: string
  meter?: LlmMeter
  onUsage?: (usage: { model: string; inputTokens: number; outputTokens: number }) => void
}

export type LlmUsageReport = { model: string; task: LlmRequest['task']; inputTokens: number; outputTokens: number; meter: LlmMeter | null }

// Called once per answered request that carries token counts. It must not throw into the caller; clients guard it.
export type LlmUsageSink = (usage: LlmUsageReport) => void

// model: the model that answers; absent for the canned stand-in used without a key.
export interface LlmClient {
  readonly model?: string
  completeJson(req: LlmRequest): Promise<unknown>
}

export const LLM_CLIENT = Symbol('LLM_CLIENT')
