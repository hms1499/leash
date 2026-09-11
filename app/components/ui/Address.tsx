'use client'

import { useState } from 'react'
import { truncateAddress } from '../../lib/address.js'
import { DATA } from './prose'

/**
 * An address, in the three shapes this app needs: read-only with an explorer
 * link, copyable, or both.
 *
 * Replaces AddressChip and CopyAddress. They were not duplicates -- one was
 * text and a link, the other a button owning the clipboard and its failure
 * state -- but the dashboard composed the second with a hand-written anchor,
 * so a third shape existed that neither owned. docs/design-system.md §6.
 *
 * The clipboard write is awaited and its failure surfaced. A denied
 * permission, an insecure context and an unfocused document all reject
 * silently, and "Copied" would then be a claim about something that did not
 * happen.
 */
export default function Address({
  address, copy = false, explorer = false, full = false, className = '', style,
}: {
  address: string
  copy?: boolean
  explorer?: boolean
  /** Show all 42 characters rather than the truncated form. */
  full?: boolean
  className?: string
  /** No default tone: the dashboard wears LABEL_STYLE, the wizard wears `.num`. */
  style?: React.CSSProperties
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  /**
   * An address is --t-data: §2's table says so, and nine call sites were each
   * deciding for themselves. Three passed a raw 14px size class and the rest passed
   * nothing, so the copy button inherited the browser's 16px -- a size on no
   * scale, measured on the dashboard on 2026-09-11.
   *
   * Spread first, so a caller with a real reason can still override it.
   */
  const face: React.CSSProperties = { ...DATA, ...style }

  const shown = full ? address : truncateAddress(address)

  const text = copy
    ? (
        <button
          // `.tap-tall` lifts a ~17px target to 44px without touching the
          // layout, so the `full break-all` case in AccountsPage stays free to
          // wrap on a phone. `.tap-focus` supplies the ring this button never
          // had -- no component library ships here, so nothing else would.
          className={`tap-tall tap-focus ${className}`.trimEnd()}
          style={{ ...face, cursor: 'pointer' }}
          title={`Copy ${address}`}
          aria-label={`Copy address ${address}`}
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(address)
                setState('copied')
                setTimeout(() => setState('idle'), 1500)
              } catch {
                setState('failed')
              }
            })()
          }}
        >
          {/* The address stays on screen and the outcome is spoken beside it.
              Swapping the label for the outcome was two defects in one: a
              screen reader was told nothing, because the accessible name is
              the aria-label above and it never changed; and "Copy failed —
              select it manually" is six times the width of a truncated
              address, so the row reflowed -- the exact thing `.num` and
              tabular figures exist to prevent (CLAUDE.md). It reflowed while
              telling the reader to go and select the text by hand. */}
          {shown}
        </button>
      )
    : <span className={className} style={face}>{shown}</span>

  // One region for both outcomes rather than a live region per state: they are
  // mutually exclusive and would otherwise compete. `aria-atomic` so the whole
  // phrase is read, not the word that changed.
  const outcome = (
    <span
      role="status"
      aria-atomic="true"
      // `motion-reveal` is §12's 90ms for a copy landing. The outcome appears beside
      // an address that does not move, which is the point: the row must not
      // reflow (see the note above), so the only thing that may change is this.
      className={state === 'idle' ? 'sr-only' : 'motion-reveal ml-2'}
      style={state === 'idle' ? undefined : { color: state === 'copied' ? 'var(--ok)' : 'var(--bad)' }}
    >
      {state === 'copied'
        ? 'Address copied'
        : state === 'failed'
          ? 'Copy failed — select the address and copy it by hand'
          : ''}
    </span>
  )

  if (!explorer) return <span className="inline">{text}{copy && outcome}</span>

  return (
    <span className="inline-flex items-center gap-2">
      {text}
      {copy && outcome}
      {/* The glyph is the whole link (design-system §2), which left a target
          about ten pixels wide. This one is fixed-width and never wraps, so it
          takes a real 44x44 box rather than the vertical-only extension the
          copy button needs. */}
      <a
        href={`https://celoscan.io/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title="Open on Celoscan"
        aria-label={`Open address ${address} on Celoscan`}
        className="tap-focus inline-flex items-center justify-center min-w-[44px] min-h-[44px] -my-3"
        style={face}
      >
        ↗
      </a>
    </span>
  )
}
