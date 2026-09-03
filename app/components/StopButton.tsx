'use client'

import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { publicClient } from '../lib/chain.js'

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
  account, paused, isOwner, onChanged,
}: {
  account: `0x${string}`; paused: boolean; isOwner: boolean; onChanged: () => void
}) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const { writeContractAsync } = useWriteContract()

  if (!isOwner) {
    return <span className="label">{paused ? 'Paused' : 'Active'}</span>
  }

  async function send(next: boolean) {
    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: PAUSE_ABI, functionName: 'setPaused', args: [next],
      })
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      for (let i = 0; i < 20; i++) {
        const now = await publicClient.readContract({
          address: account, abi: PAUSE_ABI, functionName: 'paused',
        })
        if (now === next) break
        await new Promise((r) => setTimeout(r, 3000))
      }
      onChanged()
    } finally {
      setBusy(false)
      setArming(false)
    }
  }

  if (paused) {
    return (
      <button className="btn-ghost" disabled={busy} onClick={() => void send(false)}>
        {busy ? 'Resuming…' : 'Resume'}
      </button>
    )
  }

  return (
    <button
      className="btn-stop"
      disabled={busy}
      onClick={() => (arming ? void send(true) : setArming(true))}
      onBlur={() => setArming(false)}
    >
      {busy ? 'Stopping…' : arming ? 'Confirm stop' : '■ Stop'}
    </button>
  )
}
