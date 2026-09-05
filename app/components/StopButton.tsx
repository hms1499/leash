'use client'

import { useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK } from '../lib/chain.js'
import { pollUntil } from '../lib/confirm.js'
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
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { chainId } = useAccount()

  if (!isOwner) {
    // `paused` defaults to false before the first read; printing "Active"
    // then states something nobody has checked.
    return <Label>{loading ? '—' : paused ? 'Paused' : 'Active'}</Label>
  }

  async function send(next: boolean) {
    setNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setNote(WRONG_NETWORK); return }
    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: PAUSE_ABI, functionName: 'setPaused', args: [next],
        chainId: REQUIRED_CHAIN_ID,
      })
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
      setBusy(false)
      setArming(false)
    }
  }

  return (
    <span className="flex items-center gap-2">
      {/* The note lives in the header, whose ground turns --bad the moment the
          account is paused — and the note was --bad too, so the one message an
          owner most needs to read (why Resume did nothing) was invisible at
          1.00:1. Measured 2026-09-05 while testing the wrong-network guard:
          the guard fired correctly and said so where nobody could see it. */}
      {note && (
        <Label style={{ color: paused ? 'var(--bg)' : 'var(--bad)' }}>{note}</Label>
      )}
      {paused ? (
        <Button variant="ghost" disabled={busy} onClick={() => void send(false)}>
          {busy ? 'Resuming…' : 'Resume'}
        </Button>
      ) : (
        <Button
          variant="stop"
          disabled={busy}
          onClick={() => (arming ? void send(true) : setArming(true))}
          onBlur={() => setArming(false)}
        >
          {busy ? 'Stopping…' : arming ? 'Confirm stop' : '■ Stop'}
        </Button>
      )}
    </span>
  )
}
