import { queryOptions } from '@tanstack/react-query'
import { getJson } from './api'

// The open campaign. While a search is on it asks again every few seconds, even from a background tab,
// so any screen can say a search is running and when it is done.
export const campaignQuery = <T extends { searching: boolean }>(id: number) =>
  queryOptions({
    queryKey: ['campaign', id],
    queryFn: () => getJson<T>(`/campaigns/${id}`),
    refetchInterval: (q) => (q.state.data?.searching ? 4_000 : false),
    refetchIntervalInBackground: true,
  })
