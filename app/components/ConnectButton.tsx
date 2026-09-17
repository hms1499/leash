'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { isMiniPay } from '../lib/chain.js'
import { truncateAddress } from '../lib/address.js'
import { describeConnectError, shouldAutoConnect } from '../lib/connectWallet.js'
import Button from './ui/Button'
import Label from './ui/Label'

// Module-level, not a ref: spec §2.4 says the auto-connect happens once for
// the page's life, and several ConnectButton instances mount across routes
// and wizard steps -- a per-instance ref let each new mount try again.
let autoConnectAttempted = false

/**
 * `onDangerBand` for the same reason StopButton reads `paused`: on the paused
 * header the ground is --bad, and a --bad note on it is 1.00:1.
 * docs/design-system.md §4.
 */
export default function ConnectButton({ onDangerBand = false }: { onDangerBand?: boolean }) {
  const { address, isConnected, status } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  // Learned after mount: isMiniPay() in the render body is false on the server
  // and true in MiniPay, which is a hydration mismatch.
  const [miniPay, setMiniPay] = useState(false)
  useEffect(() => { setMiniPay(isMiniPay()) }, [])

  // MiniPay users have already chosen their wallet by opening the app there.
  // Once per page -- see shouldAutoConnect.
  useEffect(() => {
    if (!connectors[0]) return
    if (!shouldAutoConnect({ miniPay, status, attempted: autoConnectAttempted })) return
    autoConnectAttempted = true
    connect({ connector: connectors[0] })
  }, [miniPay, status, connect, connectors])

  if (isConnected && address) {
    // MiniPay has no "other wallet" to go to, and its injected provider
    // cannot really be disconnected, so the address is a label there.
    //
    // Label's default color is --dim; .on-bright in globals.css only
    // recolors .control-*, so on the paused header's --bad ground this
    // would otherwise sit at ~1.06:1 -- invisible. docs/design-system.md §4.
    if (miniPay) {
      return (
        <Label className="num" style={{ color: onDangerBand ? 'var(--bg)' : undefined }}>
          {truncateAddress(address)}
        </Label>
      )
    }
    return (
      <Button
        variant="ghost"
        aria-label={`${truncateAddress(address)}, disconnect`}
        title="Disconnect"
        onClick={() => disconnect()}
      >
        {truncateAddress(address)}
      </Button>
    )
  }

  const note = describeConnectError(error)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={isPending}
        onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </Button>
      {/* Without this, a missing extension or a cancelled prompt looked like a
          button that does nothing. */}
      {note && (
        <Label role="status" style={{ color: onDangerBand ? 'var(--bg)' : 'var(--bad)' }}>
          {note}
        </Label>
      )}
    </span>
  )
}
