import { useQuery } from '@tanstack/react-query'
import { getJson } from '../api'

export type AccessState = { gate: boolean; setUp: boolean; signedIn: boolean }

// Whether this deploy has the sign-in gate and whether this browser is signed in.
export const useAccess = () => useQuery<AccessState>({ queryKey: ['access'], queryFn: () => getJson('/access'), retry: false })
