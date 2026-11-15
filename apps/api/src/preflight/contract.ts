export type PreflightStatus = 'ok' | 'warn' | 'fail' | 'info'

export type PreflightRow = {
  id: string
  label: string
  status: PreflightStatus
  detail: string
  fix?: string
}

export type TopBar = {
  mode: 'fake' | 'live'
  sentToday: number
  dailyCap: number
  workerRunning: boolean
  campaignCostMicros: number | null
  // Some model calls of the campaign had no price, so the cost is a lower bound.
  llmUnpriced: boolean
}
