'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, SWEEP_GAS, WRONG_NETWORK } from '../lib/chain.js'
import { formatDisplayAmount, parseAmount } from '../lib/policy.js'
import { planRefuel, transactionsLeft } from '../lib/gasFloat.js'
import { pollUntil } from '../lib/confirm.js'
import Address from './ui/Address'
import Panel from './ui/Panel'
import { HEADING, SUBHEAD } from './ui/prose'
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
  account, operator, token, decimals, symbol, isOwner, protectedBalance, onRefuelled,
  onGasStatusChange,
}: {
  account: `0x${string}`; operator: `0x${string}`; token: `0x${string}`
  decimals: number; symbol: string; isOwner: boolean; protectedBalance: bigint
  onRefuelled: () => void
  onGasStatusChange?: (transactionsLeft: number | null) => void
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
    lastSeenRef.current = null
    setFloat(null)
    onGasStatusChange?.(null)
    // True while a read is outstanding, so an 8-second tick cannot stack a
    // second one on top of a read still sitting in viem's 429 backoff. This
    // panel's balance is a display value refreshed on a timer, so a skipped
    // tick costs at most eight seconds of staleness; refuel() confirms its own
    // write with pollUntil and does not go through here.
    let inFlight = false

    async function read() {
      if (inFlight) return
      inFlight = true
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
        onGasStatusChange?.(transactionsLeft(bal))
        setFailed(false)
      } catch {
        // A single transient RPC failure should not blank the panel; the
        // next tick tries again. But if it never recovers, we say so below
        // rather than rendering nothing.
        if (!cancelled) setFailed(true)
      } finally {
        inFlight = false
      }
    }
    void read()
    const t = setInterval(() => { if (!document.hidden) void read() }, 8000)
    return () => { cancelled = true; clearInterval(t) }
  }, [operator, token, onGasStatusChange])

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
  // Computed here because the button label names the amount: a partial refuel
  // must not be a surprise.
  const plan = planRefuel(protectedBalance, parseAmount('0.05', decimals))

  async function refuel() {
    setNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setNote(WRONG_NETWORK); return }
    if (!plan.ok) {
      // The account cannot cover this, so the sweep would revert -- and a
      // revert here reads as a slow chain, because the operator balance
      // genuinely does not rise. Answer with the reason instead.
      setNote(plan.reason === 'empty'
        ? 'The protected account is empty. Send USDC to it before refuelling the agent.'
        : `The protected account holds ${formatDisplayAmount(protectedBalance, decimals)} ${symbol}, which is not enough for even one agent transaction. Fund the account first.`)
      return
    }
    setBusy(true)
    try {
      const amount = plan.amount
      const before = float as bigint
      await writeContractAsync({
        address: account, abi: SWEEP_ABI, functionName: 'sweep',
        args: [token, operator, amount], chainId: REQUIRED_CHAIN_ID, gas: SWEEP_GAS,
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
        onGasStatusChange?.(transactionsLeft(bal))
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
    <Panel as="section" className="p-6">
      <Label className="block">Balances</Label>
      <h2
        className="mt-2"
        style={{ ...HEADING, color: 'var(--text)' }}
      >
        Funds and agent gas
      </h2>
      <div className="grid gap-4 mt-4 sm:grid-cols-2">
        <div className="rounded p-6" style={{ background: 'var(--well)', border: '1px solid var(--line)' }}>
          <p style={SUBHEAD}>Protected account</p>
          <p className="num mt-2" style={{ fontSize: 'var(--t-heading)' }}>{formatDisplayAmount(protectedBalance, decimals)} {symbol}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            Held behind the contract&apos;s spending policy.
          </p>
        </div>
        <div className="rounded p-6" style={{ background: 'var(--well)', border: '1px solid var(--line)' }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p style={SUBHEAD}>Agent wallet</p>
            <span className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: low ? 'var(--bad)' : 'var(--ok)' }}>
              {left} gas tx left
            </span>
          </div>
          <p className="mt-2"><Address address={operator} copy explorer className="num text-sm" /></p>
          <p className="text-sm mt-2" style={{ color: low ? 'var(--bad)' : 'var(--dim)' }}>
            <span className="num">{formatDisplayAmount(float, decimals)} {symbol}</span> available for gas
            {left === 0 && '. The agent has stalled and cannot refuel itself.'}
          </p>
        </div>
      </div>
      <p className="text-sm mt-4" style={{ color: low ? 'var(--bad)' : 'var(--dim)' }}>
        Funds in the agent wallet are outside recipient restrictions. This is
        required for gas and x402 payments.
      </p>
      {note && <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>{note}</p>}
      {isOwner && low && !plan.ok && (
        <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
          {plan.reason === 'empty'
            ? 'The protected account is empty, so there is nothing to refuel the agent with.'
            : `The protected account holds ${formatDisplayAmount(protectedBalance, decimals)} ${symbol}, which is not enough for even one agent transaction.`}
        </p>
      )}
      {isOwner && low && plan.ok && (
        <Button variant="primary" className="mt-3" disabled={busy} onClick={() => void refuel()}>
          {busy ? 'Sending…' : `Send ${formatDisplayAmount(plan.amount, decimals)} ${symbol} for gas`}
        </Button>
      )}
    </Panel>
  )
}
