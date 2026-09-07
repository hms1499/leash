'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK } from '../lib/chain.js'
import { formatAmount, validateLimits } from '../lib/policy.js'
import { isValidAddress } from '../lib/address.js'
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
  { type: 'function', name: 'setAllowlistEnabled', stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'allowlistEnabled', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setAllowlist', stateMutability: 'nonpayable',
    inputs: [{ name: 'payee', type: 'address' }, { name: 'allowed', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'payeeAllowlist', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setOperator', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'operators', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const

export default function LimitsDrawer({
  account, token, decimals, symbol, perTx, daily, allowlistEnabled, operator,
  isOwner, loading, onSaved,
}: {
  account: `0x${string}`; token: `0x${string}`; decimals: number; symbol: string
  perTx: bigint; daily: bigint; allowlistEnabled: boolean; operator: string | null
  isOwner: boolean; loading: boolean
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [perTxInput, setPerTx] = useState('')
  const [dailyInput, setDaily] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [policyBusy, setPolicyBusy] = useState(false)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [payee, setPayee] = useState('')
  const [payeeAllowed, setPayeeAllowed] = useState<boolean | null>(null)
  const [agentInput, setAgentInput] = useState(operator ?? '')
  // Whether the owner has typed. Until they have, these inputs mirror the
  // chain; after they have, their edit is theirs to keep.
  const [dirty, setDirty] = useState(false)
  const { writeContractAsync } = useWriteContract()
  const { chainId } = useAccount()

  useEffect(() => {
    if (operator) setAgentInput(operator)
  }, [operator])

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

  async function setListEnabled(next: boolean) {
    setActionNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setActionNote(WRONG_NETWORK); return }
    setPolicyBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: SET_POLICY_ABI, functionName: 'setAllowlistEnabled',
        args: [next], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account, abi: SET_POLICY_ABI, functionName: 'allowlistEnabled',
        }),
      ) === next)
      setActionNote(confirmed
        ? next ? '✓ Recipient protection turned on.' : '✓ Recipient protection turned off.'
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
      onSaved()
    } catch {
      setActionNote('The transaction was not sent.')
    } finally {
      setPolicyBusy(false)
    }
  }

  async function checkPayee() {
    setActionNote(null)
    if (!isValidAddress(payee)) { setActionNote('Enter a valid Celo address.'); return }
    try {
      const allowed = await publicClient.readContract({
        address: account, abi: SET_POLICY_ABI, functionName: 'payeeAllowlist', args: [payee],
      }) as boolean
      setPayeeAllowed(allowed)
    } catch {
      setActionNote('Could not check this recipient on chain.')
    }
  }

  async function setPayeeAccess(next: boolean) {
    setActionNote(null)
    if (!isValidAddress(payee)) { setActionNote('Enter a valid Celo address.'); return }
    if (chainId !== REQUIRED_CHAIN_ID) { setActionNote(WRONG_NETWORK); return }
    setPolicyBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: SET_POLICY_ABI, functionName: 'setAllowlist',
        args: [payee, next], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account, abi: SET_POLICY_ABI, functionName: 'payeeAllowlist', args: [payee],
        }),
      ) === next)
      if (confirmed) {
        setPayeeAllowed(next)
        setActionNote(next ? '✓ Recipient approved.' : '✓ Recipient removed.')
      } else setActionNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
    } catch {
      setActionNote('The transaction was not sent.')
    } finally {
      setPolicyBusy(false)
    }
  }

  async function setAgentAccess(next: boolean) {
    setActionNote(null)
    if (!isValidAddress(agentInput)) { setActionNote('Enter a valid agent wallet address.'); return }
    if (chainId !== REQUIRED_CHAIN_ID) { setActionNote(WRONG_NETWORK); return }
    setPolicyBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: SET_POLICY_ABI, functionName: 'setOperator',
        args: [agentInput, next], chainId: REQUIRED_CHAIN_ID,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account, abi: SET_POLICY_ABI, functionName: 'operators', args: [agentInput],
        }),
      ) === next)
      setActionNote(confirmed
        ? next ? '✓ Agent access granted.' : '✓ Agent access revoked.'
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
      onSaved()
    } catch {
      setActionNote('The transaction was not sent.')
    } finally {
      setPolicyBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls="policy-editor"
        onClick={() => setOpen(!open)}
      >
        Manage policy
      </Button>
      {open && (
        <Panel className="p-6 mt-3" >
          <div id="policy-editor">
          {loading ? (
            // Never print 0.00 as if it were read. An owner cannot tell a
            // placeholder from a policy that refuses everything.
            <Label className="block">Reading the current limits…</Label>
          ) : (
            <>
              <h2 style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)' }}>Spending limits</h2>
              <Label className="block mt-3">Per transaction ({symbol})</Label>
              <input
                className="num field w-full mt-2 mb-3 p-2"
                aria-label={`Per transaction limit in ${symbol}`}
                value={perTxInput}
                onChange={(e) => { setDirty(true); setPerTx(e.target.value) }}
                disabled={!isOwner || busy}
              />
              <Label className="block">Per day ({symbol})</Label>
              <input
                className="num field w-full mt-2 mb-3 p-2"
                aria-label={`Daily limit in ${symbol}`}
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

              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
                <h2 style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)' }}>Approved recipients</h2>
                <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  {allowlistEnabled
                    ? 'Direct payments are limited to addresses approved on chain.'
                    : 'Direct payments may go to any address within the spending limits. Approve at least one recipient before turning protection on; an empty list blocks every direct payment.'}
                </p>
                {isOwner && (
                  <>
                    <Button
                      variant={allowlistEnabled ? 'stop' : 'ghost'}
                      className="mt-3"
                      disabled={policyBusy}
                      onClick={() => void setListEnabled(!allowlistEnabled)}
                    >
                      {allowlistEnabled ? 'Turn off recipient protection' : 'Turn on recipient protection'}
                    </Button>
                    <Label className="block mt-4">Check or change one recipient</Label>
                    <input
                      className="num field w-full mt-2 p-2"
                      aria-label="Recipient address"
                      placeholder="0x…"
                      value={payee}
                      onChange={(e) => { setPayee(e.target.value); setPayeeAllowed(null) }}
                      disabled={policyBusy}
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button variant="ghost" disabled={policyBusy} onClick={() => void checkPayee()}>
                        Check
                      </Button>
                      <Button variant="primary" disabled={policyBusy} onClick={() => void setPayeeAccess(true)}>
                        Approve
                      </Button>
                      <Button variant="stop" disabled={policyBusy} onClick={() => void setPayeeAccess(false)}>
                        Remove
                      </Button>
                    </div>
                    {payeeAllowed !== null && (
                      <p className="text-sm mt-2" style={{ color: payeeAllowed ? 'var(--ok)' : 'var(--dim)' }}>
                        {payeeAllowed ? 'This recipient is approved.' : 'This recipient is not approved.'}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
                <h2 style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)' }}>Agent access</h2>
                <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  Leash presents one primary agent for this MVP. Access is always verified on chain.
                </p>
                {isOwner && (
                  <>
                    <Label className="block mt-3">Agent wallet address</Label>
                    <input
                      className="num field w-full mt-2 p-2"
                      aria-label="Agent wallet address"
                      placeholder="0x…"
                      value={agentInput}
                      onChange={(e) => setAgentInput(e.target.value)}
                      disabled={policyBusy}
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button variant="primary" disabled={policyBusy} onClick={() => void setAgentAccess(true)}>
                        Grant access
                      </Button>
                      <Button variant="stop" disabled={policyBusy} onClick={() => void setAgentAccess(false)}>
                        Revoke access
                      </Button>
                    </div>
                  </>
                )}
              </div>
              {actionNote && (
                <p
                  role="status"
                  className="text-sm mt-3"
                  style={{ color: actionNote.startsWith('✓') ? 'var(--ok)' : 'var(--bad)' }}
                >
                  {actionNote}
                </p>
              )}
            </>
          )}
          </div>
        </Panel>
      )}
    </>
  )
}
