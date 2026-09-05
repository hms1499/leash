'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK } from '../lib/chain.js'
import { formatAmount, parseAmount } from '../lib/policy.js'
import { transactionsLeft } from '../lib/gasFloat.js'
import { truncateAddress } from '../lib/address.js'
import { pollUntil } from '../lib/confirm.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import Button from './ui/Button'

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
  // Set only when a read has actually failed, distinct from float===null on
  // the very first render before any read has returned. Lets a persistently
  // failing RPC say so instead of looking identical to "no operator
  // configured" — the same silent-vanish shape this branch already fixed
  // once for the feed (commit 21c9fcc).
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { chainId } = useAccount()
  // Tracks the last successfully observed balance across renders, independent
  // of the `float` state's stale-closure risk inside the 8s interval — used
  // only to notice a rise and clear a stale timeout note.
  const lastSeenRef = useRef<bigint | null>(null)

  useEffect(() => {
    let cancelled = false
    async function read() {
      try {
        const bal = await publicClient.readContract({
          address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [operator],
        }) as bigint
        if (cancelled) return
        // The float grew since we last looked — most likely a refuel that
        // landed after this panel gave up waiting on it in refuel()'s own
        // poll. The stale "not confirmed yet" note no longer describes
        // reality.
        if (lastSeenRef.current !== null && bal > lastSeenRef.current) {
          setNote(null)
        }
        lastSeenRef.current = bal
        setFloat(bal)
        setFailed(false)
      } catch {
        // A single transient RPC failure should not blank the panel; the
        // next tick tries again. But if it never recovers, we say so below
        // rather than rendering nothing.
        if (!cancelled) setFailed(true)
      }
    }
    void read()
    const t = setInterval(() => { if (!document.hidden) void read() }, 8000)
    return () => { cancelled = true; clearInterval(t) }
  }, [operator, token])

  if (float === null) {
    return failed ? (
      <Panel className="p-6">
        <p className="text-sm" style={{ color: 'var(--bad)' }}>
          Could not read the agent wallet balance.
        </p>
      </Panel>
    ) : null
  }
  const left = transactionsLeft(float)
  const low = left <= 3

  async function refuel() {
    setNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setNote(WRONG_NETWORK); return }
    setBusy(true)
    try {
      const amount = parseAmount('0.05', decimals)
      const before = float as bigint
      await writeContractAsync({
        address: account, abi: SWEEP_ABI, functionName: 'sweep',
        args: [token, operator, amount], chainId: REQUIRED_CHAIN_ID,
      })
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      const confirmed = await pollUntil(async () => {
        const bal = await publicClient.readContract({
          address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [operator],
        }) as bigint
        if (bal <= before) return false
        lastSeenRef.current = bal
        setFloat(bal)
        return true
      })
      // Never claim the confirmation we did not observe — but a refetch is
      // not a success claim, so run it either way (StopButton.tsx's
      // convention): other account figures may have changed even though
      // this panel's own float will self-heal from the background poll.
      if (!confirmed) {
        setNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
      onRefuelled()
    } catch {
      // Almost always the owner rejecting in their wallet. Silence here reads
      // as a broken button.
      setNote('The transaction was not sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-6">
      <Label className="block">Agent wallet</Label>
      <p className="num text-sm mt-2">{truncateAddress(operator)}</p>
      <p className="text-sm mt-2" style={{ color: low ? 'var(--bad)' : 'var(--dim)' }}>
        <span className="num">{formatAmount(float, decimals)} {symbol}</span> — about{' '}
        <span className="num">{left}</span>{' '}
        {left === 1 ? 'transaction' : 'transactions'} of gas left
        {left === 0 && '. The agent has stalled and cannot refuel itself.'}
      </p>
      {note && <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>{note}</p>}
      {isOwner && low && (
        <Button variant="primary" className="mt-3" disabled={busy} onClick={() => void refuel()}>
          {busy ? 'Sending…' : `Send 0.05 ${symbol} for gas`}
        </Button>
      )}
    </Panel>
  )
}
