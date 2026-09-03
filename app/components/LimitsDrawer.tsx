'use client'

import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { publicClient } from '../lib/chain.js'
import { formatAmount, parseAmount } from '../lib/policy.js'

const SET_POLICY_ABI = [
  { type: 'function', name: 'setPolicy', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'perTx', type: 'uint256' },
      { name: 'daily', type: 'uint256' }],
    outputs: [] },
  { type: 'function', name: 'limits', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'perTx', type: 'uint256' }, { name: 'daily', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' }, { name: 'day', type: 'uint64' }] },
] as const

export default function LimitsDrawer({
  account, token, decimals, symbol, perTx, daily, isOwner, onSaved,
}: {
  account: `0x${string}`; token: `0x${string}`; decimals: number; symbol: string
  perTx: bigint; daily: bigint; isOwner: boolean; onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [perTxInput, setPerTx] = useState(formatAmount(perTx, decimals, 2))
  const [dailyInput, setDaily] = useState(formatAmount(daily, decimals, 2))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { writeContractAsync } = useWriteContract()

  async function save() {
    setError(null)
    let nextPerTx: bigint
    let nextDaily: bigint
    try {
      nextPerTx = parseAmount(perTxInput, decimals)
      nextDaily = parseAmount(dailyInput, decimals)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    if (nextPerTx > nextDaily) {
      setError('The per-transaction cap cannot exceed the daily cap.')
      return
    }
    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: SET_POLICY_ABI, functionName: 'setPolicy',
        args: [token, nextPerTx, nextDaily],
      })
      let confirmed = false
      for (let i = 0; i < 20; i++) {
        const l = await publicClient.readContract({
          address: account, abi: SET_POLICY_ABI, functionName: 'limits', args: [token],
        }) as readonly [bigint, bigint, bigint, bigint]
        if (l[0] === nextPerTx && l[1] === nextDaily) { confirmed = true; break }
        await new Promise((r) => setTimeout(r, 3000))
      }
      onSaved()
      // Closing the drawer is how this UI says "saved". Only say it if the
      // chain actually agreed; otherwise stay open and explain.
      if (confirmed) setOpen(false)
      else setError('Sent, but the chain has not confirmed it yet. Reload in a moment.')
    } catch (e) {
      setError((e as Error).message || 'The transaction was not sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(!open)}>Limits</button>
      {open && (
        <div className="panel p-4 mt-3">
          <p className="label">Per transaction ({symbol})</p>
          <input
            className="num w-full mt-1 mb-3 p-2"
            style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
            value={perTxInput}
            onChange={(e) => setPerTx(e.target.value)}
            disabled={!isOwner || busy}
          />
          <p className="label">Per day ({symbol})</p>
          <input
            className="num w-full mt-1 mb-3 p-2"
            style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
            value={dailyInput}
            onChange={(e) => setDaily(e.target.value)}
            disabled={!isOwner || busy}
          />
          {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }}>{error}</p>}
          {isOwner ? (
            <button className="btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <p className="label">Only the owner can change these limits.</p>
          )}
        </div>
      )}
    </>
  )
}
