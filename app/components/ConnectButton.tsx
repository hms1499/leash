'use client'

import { useEffect } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { isMiniPay } from '../lib/chain.js'
import { truncateAddress } from '../lib/address.js'

export default function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  // MiniPay users have already chosen their wallet by opening the app there.
  useEffect(() => {
    if (!isConnected && isMiniPay() && connectors[0]) {
      connect({ connector: connectors[0] })
    }
  }, [isConnected, connect, connectors])

  if (isConnected && address) {
    return (
      <button className="btn-ghost" onClick={() => disconnect()}>
        {truncateAddress(address)}
      </button>
    )
  }

  return (
    <button
      className="btn-primary"
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      Connect wallet
    </button>
  )
}
