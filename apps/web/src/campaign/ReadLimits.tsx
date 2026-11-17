import { field as baseField } from '../ui/ui'
import { FOLLOWERS_RANGE, FOLLOWING_RANGE, SEARCH_RANGE } from './read-limits'

const field = `${baseField} mt-1 max-w-40`

type Props = { id: string; searchMax: string; followingMax: string; followersMax: string; onSearchMax: (v: string) => void; onFollowingMax: (v: string) => void; onFollowersMax: (v: string) => void }

export default function ReadLimits({ id, searchMax, followingMax, followersMax, onSearchMax, onFollowingMax, onFollowersMax }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor={`${id}-search-max`} className="text-sm font-medium">
          Posts per search query
        </label>
        <input id={`${id}-search-max`} type="number" inputMode="numeric" min={SEARCH_RANGE[0]} max={SEARCH_RANGE[1]} step="1" value={searchMax} onChange={(e) => onSearchMax(e.target.value)} className={field} />
        <p className="mt-1 text-xs text-muted">
          {SEARCH_RANGE[0]} to {SEARCH_RANGE[1]}. Each post and its author cost about $0.015.
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-following-max`} className="text-sm font-medium">
          People per seed account
        </label>
        <input id={`${id}-following-max`} type="number" inputMode="numeric" min={FOLLOWING_RANGE[0]} max={FOLLOWING_RANGE[1]} step="1" value={followingMax} onChange={(e) => onFollowingMax(e.target.value)} className={field} />
        <p className="mt-1 text-xs text-muted">
          {FOLLOWING_RANGE[0]} to {FOLLOWING_RANGE[1]}. Each person read costs about $0.01.
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-followers-max`} className="text-sm font-medium">
          Most followers
        </label>
        <input id={`${id}-followers-max`} type="number" inputMode="numeric" min={FOLLOWERS_RANGE[0]} max={FOLLOWERS_RANGE[1]} step="1" value={followersMax} onChange={(e) => onFollowersMax(e.target.value)} className={field} />
        <p className="mt-1 text-xs text-muted">Bigger accounts found by search or seeds are left out. A handle you name is always kept.</p>
      </div>
    </div>
  )
}
