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
  workerRunning: boolean
  campaignCostMicros: number | null
}
