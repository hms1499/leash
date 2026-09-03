'use client'

import { useEffect, useState } from 'react'
import { useWriteContract } from 'wagmi'
import { publicClient } from '../lib/chain.js'
import { formatAmount, parseAmount } from '../lib/policy.js'
import { transactionsLeft } from '../lib/gasFloat.js'
import { truncateAddress } from '../lib/address.js'

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

const SWEEP_ABI = [
  { type: 'function', name: 'sweep', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' },
             { name: 'to', type: 'address' },
             { name: 'amount', type: 'uint256' }],
    outputs: [] },
] as const

/**
 * Refuelling goes through sweep(), not topUpOperator().
 *
 * topUpOperator is the agent's own path and costs the agent gas — which is
 * exactly what it has run out of. sweep is the owner's, and the owner is
 * deliberately unconstrained by policy, so the rescue works when nothing else
 * does.
 */
export default function AgentPanel({
  account, operator, token, decimals, symbol, isOwner, onRefuelled,
}: {
  account: `0x${string}`; operator: `0x${string}`; token: `0x${string}`
  decimals: number; symbol: string; isOwner: boolean; onRefuelled: () => void
}) {
  const [float, setFloat] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()

  useEffect(() => {
    let cancelled = false
    async function read() {
      try {
        const bal = await publicClient.readContract({
          address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [operator],
        }) as bigint
        if (!cancelled) setFloat(bal)
      } catch {
        // A single transient RPC failure should not blank the panel; the
        // next tick tries again.
      }
    }
    void read()
    const t = setInterval(() => { if (!document.hidden) void read() }, 8000)
    return () => { cancelled = true; clearInterval(t) }
  }, [operator, token])

  if (float === null) return null
  const left = transactionsLeft(float)
  const low = left <= 3

  async function refuel() {
    setBusy(true)
    setNote(null)
    try {
      const amount = parseAmount('0.05', decimals)
      const before = float as bigint
      await writeContractAsync({
        address: account, abi: SWEEP_ABI, functionName: 'sweep',
        args: [token, operator, amount],
      })
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      let confirmed = false
      for (let i = 0; i < 20; i++) {
        try {
          const bal = await publicClient.readContract({
            address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [operator],
          }) as bigint
          if (bal > before) { setFloat(bal); confirmed = true; break }
        } catch {
          // One transient RPC failure should not end the poll early.
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
      // Never report a success we did not observe.
      if (confirmed) {
        onRefuelled()
      } else {
        setNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      // Almost always the owner rejecting in their wallet. Silence here reads
      // as a broken button.
      setNote('The transaction was not sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel p-4">
      <p className="label">Agent wallet</p>
      <p className="num text-sm mt-1">{truncateAddress(operator)}</p>
      <p className="text-sm mt-2" style={{ color: low ? 'var(--bad)' : 'var(--dim)' }}>
        {formatAmount(float, decimals)} {symbol} — about {left}{' '}
        {left === 1 ? 'transaction' : 'transactions'} of gas left
        {left === 0 && '. The agent has stalled and cannot refuel itself.'}
      </p>
      {note && <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>{note}</p>}
      {isOwner && low && (
        <button className="btn-primary mt-3" disabled={busy} onClick={() => void refuel()}>
          {busy ? 'Sending…' : `Send 0.05 ${symbol} for gas`}
        </button>
      )}
    </div>
  )
}
