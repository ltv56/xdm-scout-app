import { useQuery } from '@tanstack/react-query'
import type { Funnel as FunnelData } from '../../api/src/funnel/contract'
import { getJson } from './api'

export const useFunnel = (campaignId: number) =>
  useQuery<FunnelData>({ queryKey: ['funnel', campaignId], queryFn: () => getJson(`/funnel?campaignId=${campaignId}`), refetchInterval: 30_000, retry: false })
