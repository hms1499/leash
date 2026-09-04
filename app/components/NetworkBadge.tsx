'use client'

import { useAccount, useSwitchChain } from 'wagmi'
import { celo } from 'viem/chains'
import Button from './ui/Button'
import Label from './ui/Label'

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
    return <Label style={{ color: 'var(--celo)' }}>Celo</Label>
  }

  return (
    <Button
      variant="stop"
      // The label type treatment, kept: this reads as a badge in the header
      // band, not as an action of the same weight as Connect. The variant is
      // what supplies the cursor, the focus ring and the disabled state.
      style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}
      disabled={isPending}
      onClick={() => switchChain({ chainId: celo.id })}
    >
      {isPending ? 'Switching…' : 'Wrong network — switch to Celo'}
    </Button>
  )
}
