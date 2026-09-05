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
/**
 * `onDangerBand` says this is sitting on the paused header, whose ground is
 * --bad itself. The stop variant is --bad on transparent, so on that band it
 * renders red on red: a contrast ratio of exactly 1.00, which is not "hard to
 * read" but invisible. Measured 2026-09-05, after a wrong-network test where
 * the badge and the warning it points at were both on screen and neither
 * could be seen. --bg on --bad is 5.10, the same dark-on-bright treatment the
 * primary button already uses on Celo yellow.
 */
export default function NetworkBadge({ onDangerBand = false }: { onDangerBand?: boolean }) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === celo.id) {
    // The right-network branch is on the band too, and --celo on --bad is
    // 3.55 -- under the body bar. The bright-ground rule is not only about
    // the warning: it is about everything drawn on that ground.
    return <Label style={{ color: onDangerBand ? 'var(--bg)' : 'var(--celo)' }}>Celo</Label>
  }

  return (
    <Button
      variant="stop"
      // The label type treatment, kept: this reads as a badge in the header
      // band, not as an action of the same weight as Connect. The variant is
      // what supplies the cursor, the focus ring and the disabled state.
      onDangerBand={onDangerBand}
      style={{
        padding: '0.25rem 0.5rem', fontSize: '0.6875rem', letterSpacing: '0.16em', textTransform: 'uppercase',
      }}
      disabled={isPending}
      onClick={() => switchChain({ chainId: celo.id })}
    >
      {isPending ? 'Switching…' : 'Wrong network — switch to Celo'}
    </Button>
  )
}
