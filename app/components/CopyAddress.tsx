'use client'

import { useState } from 'react'
import { truncateAddress } from '../lib/address.js'

/**
 * An address you can take with you. Spec §4 asks for click-to-copy, and §2.1
 * says mobile-first because MiniPay is a phone — where retyping 42 hex
 * characters from a screen is the worst interaction the app has.
 *
 * The clipboard write is awaited and its failure surfaced, following
 * McpHandoff: a denied permission, an insecure context or an unfocused
 * document all reject silently, and "Copied" would then be a claim about
 * something that did not happen.
 */
export default function CopyAddress({
  address, full = false, className = '', style,
}: {
  address: `0x${string}`
  /** Show all 42 characters rather than the truncated form. */
  full?: boolean
  className?: string
  /** No default tone: the dashboard wears LABEL_STYLE from ui/Label, the
   *  wizard wears `.num`. This used to default to the `label` class, which
   *  no longer exists. */
  style?: React.CSSProperties
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  return (
    <button
      className={className}
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
          : full ? address : truncateAddress(address)}
    </button>
  )
}
