'use client'

import { useEffect } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { isMiniPay } from '../lib/chain.js'
import { truncateAddress } from '../lib/address.js'
import Button from './ui/Button'

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
      <Button variant="ghost" onClick={() => disconnect()}>
        {truncateAddress(address)}
      </Button>
    )
  }

  return (
    <Button
      variant="primary"
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      Connect wallet
    </Button>
  )
}
