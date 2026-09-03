'use client'

import { useAccount, useSwitchChain } from 'wagmi'
import { celo } from 'viem/chains'

/**
 * Which chain the wallet is actually on, and a way out when it is the wrong
 * one. Spec §4 asks for this in the header band; it is also the missing
 * signal behind the wrong-chain hazard the write paths now refuse.
 *
 * The read path is always Celo — publicClient is pinned to it — so with no
 * wallet connected this states the chain being read rather than asking a
 * visitor to do anything.
 */
export default function NetworkBadge() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === celo.id) {
    return <span className="label" style={{ color: 'var(--celo)' }}>Celo</span>
  }

  return (
    <button
      className="label"
      style={{ color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 4, padding: '0.25rem 0.5rem' }}
      disabled={isPending}
      onClick={() => switchChain({ chainId: celo.id })}
    >
      {isPending ? 'Switching…' : 'Wrong network — switch to Celo'}
    </button>
  )
}
