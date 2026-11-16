import { useQuery } from '@tanstack/react-query'
import type { TopBar } from '../../api/src/preflight/contract'
import { getJson } from './api'

export const useTopBar = (campaignId: number | null) =>
  useQuery<TopBar>({
    queryKey: ['top-bar', campaignId],
    queryFn: () => getJson(`/top-bar${campaignId === null ? '' : `?campaignId=${campaignId}`}`),
    refetchInterval: 30_000,
    retry: false,
  })
