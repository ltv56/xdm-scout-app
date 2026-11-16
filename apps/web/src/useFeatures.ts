import { useQuery } from '@tanstack/react-query'
import type { Features } from '../../api/src/feature-flags'
import { getJson } from './api'

// What this deploy offers. Until the answer comes back everything counts as on, the same as a local run.
export function useFeatures(): Features {
  const q = useQuery<Features>({ queryKey: ['features'], queryFn: () => getJson('/features'), staleTime: Infinity, retry: false })
  return q.data ?? { callPost: true }
}
