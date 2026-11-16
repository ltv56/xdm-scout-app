import { useQuery } from '@tanstack/react-query'
import type { KeysPage } from '../../../api/src/keys/contract'
import { getJson } from '../api'

// Live mode needs the owner's X app keys before the X account can be connected.
export function useXAppKeys(live: boolean) {
  const page = useQuery<KeysPage>({ queryKey: ['keys'], queryFn: () => getJson('/keys'), enabled: live, retry: false })
  return { ready: !live || (!!page.data?.keys.xClientId.set && !!page.data?.keys.xClientSecret.set), loading: live && page.isLoading }
}
