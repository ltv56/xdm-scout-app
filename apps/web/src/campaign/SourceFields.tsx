import { handle } from '../format'
import TagInput from '../ui/TagInput'

interface Props {
  handles: string[]
  seeds: string[]
  queries: string[]
  onHandles: (v: string[]) => void
  onSeeds: (v: string[]) => void
  onQueries: (v: string[]) => void
  handlesNote?: string
}

export default function SourceFields({ handles, seeds, queries, onHandles, onSeeds, onQueries, handlesNote }: Props) {
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
        <TagInput label="Search queries" value={queries} onChange={onQueries} max={10} placeholder="Type a query, press Enter" labelClassName="text-sm text-muted" />
        <p className="mt-1 text-xs text-muted">Recent-post searches on X. Up to 10.</p>
      </div>
    </>
  )
}
