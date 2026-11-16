import { useEffect, useRef, useState } from 'react'
import type { ExtractResult } from '../../../api/src/known/contract'
import { plural, usd } from '../format'
import { btnPrimary, btnSecondary } from '../ui/ui'

// What the model read from a file, numbered, so a person checks nobody was missed before the handles are used.
export default function HandlePicker({ fileName, result, onUse, onClose }: { fileName: string; result: ExtractResult; onUse: (handles: string[]) => void; onClose: () => void }) {
  const [skip, setSkip] = useState<Set<string>>(() => new Set())
  const first = useRef<HTMLButtonElement>(null)
  const chosen = result.handles.filter((h) => !skip.has(h.handle))
  const toggle = (handle: string) =>
    setSkip((s) => {
      const next = new Set(s)
      if (!next.delete(handle)) next.add(handle)
      return next
    })

  useEffect(() => first.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="picker-title" className="anim-pop flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-raised shadow-pop">
        <div className="border-b border-rule px-6 py-5">
          <h2 id="picker-title" className="text-lg font-semibold">
            Found {plural(result.handles.length, 'handle')} in {fileName}
          </h2>
          <p className="mt-1 text-sm text-muted">Check the list against the file. Untick anyone you do not want.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {result.handles.length === 0 ? (
            <p className="text-sm text-muted">No handle in this file.</p>
          ) : (
            <ol aria-label="Handles found" className="space-y-1">
              {result.handles.map((h, i) => (
                <li key={h.handle}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-rail">
                    <span className="w-7 shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted">{i + 1}.</span>
                    <input type="checkbox" className="mt-1" checked={!skip.has(h.handle)} onChange={() => toggle(h.handle)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">@{h.handle}</span>
                      <span className="block truncate text-xs text-muted" title={h.line}>
                        Line {h.lineNo}: {h.line}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ol>
          )}
          {result.missedLines.length > 0 && (
            <details className="mt-4 rounded-xl bg-rail px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">No handle found on {plural(result.missedLines.length, 'line')}</summary>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {result.missedLines.map((l) => (
                  <li key={l.lineNo} className="truncate" title={l.line}>
                    Line {l.lineNo}: {l.line}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-6 py-4">
          <p role="status" className="text-xs text-muted">
            {result.model
              ? `Read by ${result.model}: ${result.inputTokens.toLocaleString()} tokens in, ${result.outputTokens.toLocaleString()} out, ${result.costMicros === null ? 'no price for this model yet' : usd(result.costMicros)}.`
              : 'No model key: handles written as @name or x.com links were picked out, at no cost.'}
          </p>
          <div className="flex gap-3">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button ref={first} type="button" className={btnPrimary} disabled={chosen.length === 0} onClick={() => onUse(chosen.map((h) => h.handle))}>
              Use {chosen.length === 1 ? 'this one' : `these ${chosen.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
