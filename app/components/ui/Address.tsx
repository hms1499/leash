'use client'

import { useState } from 'react'
import { truncateAddress } from '../../lib/address.js'

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
  const shown = full ? address : truncateAddress(address)

  const text = copy
    ? (
        <button
          // `.tap-tall` lifts a ~17px target to 44px without touching the
          // layout, so the `full break-all` case in AccountsPage stays free to
          // wrap on a phone. `.tap-focus` supplies the ring this button never
          // had -- no component library ships here, so nothing else would.
          className={`tap-tall tap-focus ${className}`.trimEnd()}
          style={{ ...style, cursor: 'pointer' }}
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
          {state === 'copied'
            ? 'Copied'
            : state === 'failed'
              ? 'Copy failed — select it manually'
              : shown}
        </button>
      )
    : <span className={className} style={style}>{shown}</span>

  if (!explorer) return text

  return (
    <span className="inline-flex items-center gap-2">
      {text}
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
        style={style}
      >
        ↗
      </a>
    </span>
  )
}
