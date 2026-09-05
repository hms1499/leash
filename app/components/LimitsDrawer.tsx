'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK } from '../lib/chain.js'
import { formatAmount, validateLimits } from '../lib/policy.js'
import { pollUntil } from '../lib/confirm.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import Button from './ui/Button'

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
  account, token, decimals, symbol, perTx, daily, isOwner, loading, onSaved,
}: {
  account: `0x${string}`; token: `0x${string}`; decimals: number; symbol: string
  perTx: bigint; daily: bigint; isOwner: boolean; loading: boolean
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [perTxInput, setPerTx] = useState('')
  const [dailyInput, setDaily] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Whether the owner has typed. Until they have, these inputs mirror the
  // chain; after they have, their edit is theirs to keep.
  const [dirty, setDirty] = useState(false)
  const { writeContractAsync } = useWriteContract()
  const { chainId } = useAccount()

  // The limits arrive one poll AFTER first render, so seeding these inputs
  // from a useState initialiser froze them at the pre-read 0n/0n — showing
  // 0.00 next to a meter reading 1.000000, and saving a daily cap of 0, which
  // is the contract's "unconfigured" sentinel and refuses every later spend.
  // Props are the source of truth here; state only holds an in-progress edit.
  useEffect(() => {
    if (dirty) return
    setPerTx(formatAmount(perTx, decimals, 2))
    setDaily(formatAmount(daily, decimals, 2))
  }, [perTx, daily, decimals, dirty])

  async function save() {
    setError(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setError(WRONG_NETWORK); return }
    const parsed = validateLimits(perTxInput, dailyInput, decimals, { perTx, daily })
    if (!parsed.ok) { setError(parsed.error); return }
    const { perTx: nextPerTx, daily: nextDaily } = parsed

    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: SET_POLICY_ABI, functionName: 'setPolicy',
        args: [token, nextPerTx, nextDaily], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => {
        const l = await publicClient.readContract({
          address: account, abi: SET_POLICY_ABI, functionName: 'limits', args: [token],
        }) as readonly [bigint, bigint, bigint, bigint]
        return l[0] === nextPerTx && l[1] === nextDaily
      })
      onSaved()
      // Closing the drawer is how this UI says "saved". Only say it if the
      // chain actually agreed; otherwise stay open and explain.
      if (confirmed) {
        // The edit has landed, so the inputs go back to mirroring the chain.
        setDirty(false)
        setOpen(false)
      } else {
        setError('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      // Almost always the owner rejecting in their wallet. A raw viem error
      // string does not belong in front of a stranger — it is a multi-line
      // block with request details and a docs URL, and it would blow out this
      // drawer's layout the first time anyone hits Reject. The wizard's
      // setLimits() says exactly this for exactly this reason; two
      // implementations of one operation should not behave differently.
      setError('The transaction was not sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(!open)}>Limits</Button>
      {open && (
        <Panel className="p-6 mt-3">
          {loading ? (
            // Never print 0.00 as if it were read. An owner cannot tell a
            // placeholder from a policy that refuses everything.
            <Label className="block">Reading the current limits…</Label>
          ) : (
            <>
              <Label className="block">Per transaction ({symbol})</Label>
              <input
                className="num field w-full mt-2 mb-3 p-2"
                value={perTxInput}
                onChange={(e) => { setDirty(true); setPerTx(e.target.value) }}
                disabled={!isOwner || busy}
              />
              <Label className="block">Per day ({symbol})</Label>
              <input
                className="num field w-full mt-2 mb-3 p-2"
                value={dailyInput}
                onChange={(e) => { setDirty(true); setDaily(e.target.value) }}
                disabled={!isOwner || busy}
              />
              {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }}>{error}</p>}
              {isOwner ? (
                <Button variant="primary" disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save'}
                </Button>
              ) : (
                <Label className="block">Only the owner can change these limits.</Label>
              )}
            </>
          )}
        </Panel>
      )}
    </>
  )
}
