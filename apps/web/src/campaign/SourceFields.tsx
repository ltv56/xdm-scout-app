import { handle } from '../format'
import TagInput from '../ui/TagInput'

interface Props {
  handles: string[]
  seeds: string[]
  followersOf: string[]
  queries: string[]
  regions: string[]
  onHandles: (v: string[]) => void
  onSeeds: (v: string[]) => void
  onFollowersOf: (v: string[]) => void
  onQueries: (v: string[]) => void
  onRegions: (v: string[]) => void
  handlesNote?: string
}

export default function SourceFields({ handles, seeds, followersOf, queries, onHandles, onSeeds, onFollowersOf, onQueries, regions, onRegions, handlesNote }: Props) {
  return (
    <>
      <div>
        <TagInput label="Handles" value={handles} onChange={onHandles} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
        <p className="mt-1 text-xs text-muted">These people are added as candidates themselves. With or without @.{handlesNote && ` ${handlesNote}`}</p>
      </div>
      <div>
        <TagInput label="Seed accounts" value={seeds} onChange={onSeeds} max={10} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
        <p className="mt-1 text-xs text-muted">The people these accounts follow are added, not the accounts themselves. Up to 10.</p>
      </div>
      <div>
        <TagInput label="Followers of" value={followersOf} onChange={onFollowersOf} max={10} normalize={handle} placeholder="@handle, press Enter" labelClassName="text-sm text-muted" />
        <p className="mt-1 text-xs text-muted">The people who follow these accounts are added. Best for a community or program account, such as a national AI program. Up to 10.</p>
      </div>
      <div>
        <TagInput label="Search queries" value={queries} onChange={onQueries} max={10} placeholder="Type a query, press Enter" labelClassName="text-sm text-muted" />
        <p className="mt-1 text-xs text-muted">Recent-post searches on X. Up to 10.</p>
      </div>
      <div>
        <TagInput label="Regions" value={regions} onChange={onRegions} max={60} placeholder="Country or city, press Enter" labelClassName="text-sm text-muted" />
        <p className="mt-1 text-xs text-muted">People whose X location names a place outside these are skipped before their posts are read, which saves the reads. No location: kept. Empty: no filter.</p>
      </div>
    </>
  )
}
