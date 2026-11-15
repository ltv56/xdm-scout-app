// Which campaign and lane a call is paid for; the lane is that of the person it is about.
export type LlmMeter = { campaignId: number; lane: 'search' | 'call' }

export type LlmRequest = { task: 'fit' | 'verify' | 'draft' | 'decide' | 'translate' | 'reply'; system: string; user: string; meter?: LlmMeter }

export type LlmUsageReport = { model: string; task: LlmRequest['task']; inputTokens: number; outputTokens: number; meter: LlmMeter | null }

// Called once per answered request that carries token counts. It must not throw into the caller; clients guard it.
export type LlmUsageSink = (usage: LlmUsageReport) => void

export interface LlmClient {
  completeJson(req: LlmRequest): Promise<unknown>
}

export const LLM_CLIENT = Symbol('LLM_CLIENT')
