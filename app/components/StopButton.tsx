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
  account, paused, isOwner, loading, onChanged,
}: {
  account: `0x${string}`; paused: boolean; isOwner: boolean; loading: boolean
  onChanged: () => void
}) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()

  if (!isOwner) {
    // `paused` defaults to false before the first read; printing "Active"
    // then states something nobody has checked.
    return <span className="label">{loading ? '—' : paused ? 'Paused' : 'Active'}</span>
  }

  async function send(next: boolean) {
    setBusy(true)
    setNote(null)
    try {
      await writeContractAsync({
        address: account, abi: PAUSE_ABI, functionName: 'setPaused', args: [next],
      })
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      let confirmed = false
      for (let i = 0; i < 20; i++) {
        const now = await publicClient.readContract({
          address: account, abi: PAUSE_ABI, functionName: 'paused',
        })
        if (now === next) { confirmed = true; break }
        await new Promise((r) => setTimeout(r, 3000))
      }
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
      {note && <span className="label" style={{ color: 'var(--bad)' }}>{note}</span>}
      {paused ? (
        <button className="btn-ghost" disabled={busy} onClick={() => void send(false)}>
          {busy ? 'Resuming…' : 'Resume'}
        </button>
      ) : (
        <button
          className="btn-stop"
          disabled={busy}
          onClick={() => (arming ? void send(true) : setArming(true))}
          onBlur={() => setArming(false)}
        >
          {busy ? 'Stopping…' : arming ? 'Confirm stop' : '■ Stop'}
        </button>
      )}
    </span>
  )
}
