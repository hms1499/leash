'use client'

import { useRef, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, SET_PAUSED_GAS, WRONG_NETWORK } from '../lib/chain.js'
import { pollUntil } from '../lib/confirm.js'
import { useArming } from '../lib/arming.js'
import { isBusy, outcomeForOtherWallet, ownerControlView, writeLabel, type WritePhase } from '../lib/writePhase.js'
import Button from './ui/Button'
import Label from './ui/Label'

const PAUSE_ABI = [
  { type: 'function', name: 'setPaused', stateMutability: 'nonpayable',
    inputs: [{ name: 'paused', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'paused', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
] as const

/**
 * The kill switch. Two beats rather than a modal: a modal breaks the pace of
 * a live demo, and this is a real transaction either way.
 */
export default function StopButton({
  account, paused, isOwner, loading, onChanged,
}: {
  account: `0x${string}`; paused: boolean; isOwner: boolean; loading: boolean
  onChanged: () => void
}) {
  const { armed, arm, disarm } = useArming()
  const [phase, setPhase] = useState<WritePhase>('idle')
  const busy = isBusy(phase)
  const [note, setNote] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { address: connected, chainId } = useAccount()
  // Who pressed, for an outcome that arrives after they have gone.
  const sender = useRef<string | null>(null)

  const view = ownerControlView(isOwner, [phase], note)
  if (view === 'pending' || view === 'outcome') {
    // No button in either: the wallet connected now does not own this
    // account, and a Stop it sent would revert and be paid for.
    return (
      <Label role="status" style={{ color: paused ? 'var(--bg)' : 'var(--bad)' }}>
        {view === 'pending'
          ? writeLabel(phase, { idle: '', sending: 'Waiting for the wallet…' })
          : outcomeForOtherWallet(note ?? '', sender.current)}
      </Label>
    )
  }
  if (view === 'hidden') {
    // `paused` defaults to false before the first read; printing "Active"
    // then states something nobody has checked.
    //
    // The bright-ground rule applies here too, and this was the last place on
    // the band still breaking it: a visitor with no wallet connected is not
    // the owner, so this branch is what the paused dashboard shows a stranger
    // -- and --dim on --bad is 1.20:1. The word "Paused" was invisible in
    // exactly the case a shared link is opened. docs/design-system.md §4.
    return (
      <Label style={{ color: paused ? 'var(--bg)' : undefined }}>
        {loading ? '—' : paused ? 'Paused' : 'Active'}
      </Label>
    )
  }

  async function send(next: boolean) {
    setNote(null)
    sender.current = connected ?? null
    if (chainId !== REQUIRED_CHAIN_ID) { setNote(WRONG_NETWORK); return }
    setPhase('sending')
    try {
      await writeContractAsync({
        address: account, abi: PAUSE_ABI, functionName: 'setPaused', args: [next],
        chainId: REQUIRED_CHAIN_ID, gas: SET_PAUSED_GAS,
      })
      // The owner's part is over the moment the wallet returns a hash, and the
      // button has to stop claiming otherwise -- everything below this line is
      // the chain being waited on, not them.
      setPhase('confirming')
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      const confirmed = await pollUntil(async () => {
        const now = await publicClient.readContract({
          address: account, abi: PAUSE_ABI, functionName: 'paused',
        })
        return now === next
      })
      // Sixty seconds without the value changing means we stopped waiting,
      // not that it worked. Never report a success we did not observe.
      if (!confirmed) {
        setNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
      onChanged()
    } catch {
      // Almost always the owner rejecting in their wallet. Silence here reads
      // as a broken button.
      setNote('The transaction was not sent.')
    } finally {
      setPhase('idle')
      disarm()
    }
  }

  return (
    <span className="flex items-center gap-2">
      {/* The note lives in the header, whose ground turns --bad the moment the
          account is paused — and the note was --bad too, so the one message an
          owner most needs to read (why Resume did nothing) was invisible at
          1.00:1. Measured 2026-09-05 while testing the wrong-network guard:
          the guard fired correctly and said so where nobody could see it. */}
      {/* role="status" because this note is the only account an owner gets of
          a write that failed or went unconfirmed, and without a live region a
          screen reader says nothing at all when Stop is refused by the wallet.
          Every sibling note in the app -- AgentAccessPanel, OwnershipDrawer,
          TopUpDrawer -- already announces the same sentences. */}
      {note && (
        <Label role="status" style={{ color: paused ? 'var(--bg)' : 'var(--bad)' }}>{note}</Label>
      )}
      {paused ? (
        <Button variant="ghost" onDangerBand={paused} disabled={busy} onClick={() => void send(false)}>
          {writeLabel(phase, { idle: 'Resume', sending: 'Resuming…' })}
        </Button>
      ) : (
        <Button
          variant="stop"
          disabled={busy}
          onClick={() => (armed ? void send(true) : arm(true))}
        >
          {writeLabel(phase, {
            idle: armed ? 'Confirm stop' : '■ Stop',
            sending: 'Stopping…',
          })}
        </Button>
      )}
    </span>
  )
}
