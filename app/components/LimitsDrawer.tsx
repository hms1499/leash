'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import {
  publicClient, REQUIRED_CHAIN_ID, SET_ALLOWLIST_ENABLED_GAS, SET_ALLOWLIST_GAS,
  SET_POLICY_GAS, WRONG_NETWORK,
} from '../lib/chain.js'
import { formatDisplayAmount, validateLimits } from '../lib/policy.js'
import { isValidAddress } from '../lib/address.js'
import { pollUntil } from '../lib/confirm.js'
import { useArming } from '../lib/arming.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import Button from './ui/Button'
import { HEADING } from './ui/prose'

const POLICY_ABI = [
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
] as const

export default function LimitsDrawer({
  account, token, decimals, symbol, perTx, daily, allowlistEnabled, loading, onSaved,
}: {
  account: `0x${string}`
  token: `0x${string}`
  decimals: number
  symbol: string
  perTx: bigint
  daily: bigint
  allowlistEnabled: boolean
  loading: boolean
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [perTxInput, setPerTx] = useState('')
  const [dailyInput, setDaily] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recipientBusy, setRecipientBusy] = useState(false)
  const [recipientNote, setRecipientNote] = useState<string | null>(null)
  const [payee, setPayee] = useState('')
  const [payeeAllowed, setPayeeAllowed] = useState<boolean | null>(null)
  const [dirty, setDirty] = useState(false)
  // Two beats before removing an approved payee, the StopButton /
  // AgentAccessPanel pattern. Turning protection ON is already refused
  // without a verified address ("An empty allowlist blocks every direct
  // payment"); removing the last one reaches the same dead end from the other
  // side, and had no gate at all.
  const { armed: removeArmed, arm: armRemove, disarm: disarmRemove } = useArming()
  const { writeContractAsync } = useWriteContract()
  const { chainId } = useAccount()

  useEffect(() => {
    if (dirty) return
    // formatDisplayAmount, not formatAmount: the latter truncates, and this
    // string is what Save writes back.
    setPerTx(formatDisplayAmount(perTx, decimals, 2))
    setDaily(formatDisplayAmount(daily, decimals, 2))
  }, [perTx, daily, decimals, dirty])

  async function saveLimits() {
    setError(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setError(WRONG_NETWORK); return }
    const parsed = validateLimits(perTxInput, dailyInput, decimals, { perTx, daily })
    if (!parsed.ok) { setError(parsed.error); return }

    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: POLICY_ABI, functionName: 'setPolicy',
        args: [token, parsed.perTx, parsed.daily], chainId: REQUIRED_CHAIN_ID, gas: SET_POLICY_GAS,
      })
      const confirmed = await pollUntil(async () => {
        const limits = await publicClient.readContract({
          address: account, abi: POLICY_ABI, functionName: 'limits', args: [token],
        }) as readonly [bigint, bigint, bigint, bigint]
        return limits[0] === parsed.perTx && limits[1] === parsed.daily
      })
      onSaved()
      if (confirmed) {
        setDirty(false)
        setOpen(false)
      } else {
        setError('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      setError('The transaction was not sent.')
    } finally {
      setBusy(false)
    }
  }

  async function setRecipientProtection(next: boolean) {
    setRecipientNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setRecipientNote(WRONG_NETWORK); return }
    setRecipientBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: POLICY_ABI, functionName: 'setAllowlistEnabled',
        args: [next], chainId: REQUIRED_CHAIN_ID, gas: SET_ALLOWLIST_ENABLED_GAS,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account, abi: POLICY_ABI, functionName: 'allowlistEnabled',
        }),
      ) === next)
      setRecipientNote(confirmed
        ? next ? '✓ Recipient protection turned on.' : '✓ Recipient protection turned off.'
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
      onSaved()
    } catch {
      setRecipientNote('The transaction was not sent.')
    } finally {
      setRecipientBusy(false)
    }
  }

  async function checkPayee() {
    setRecipientNote(null)
    if (!isValidAddress(payee)) { setRecipientNote('Enter a valid Celo address.'); return }
    setRecipientBusy(true)
    try {
      const allowed = await publicClient.readContract({
        address: account, abi: POLICY_ABI, functionName: 'payeeAllowlist', args: [payee],
      }) as boolean
      setPayeeAllowed(allowed)
    } catch {
      setRecipientNote('Could not check this recipient on chain.')
    } finally {
      setRecipientBusy(false)
    }
  }

  async function setPayeeAccess(next: boolean) {
    setRecipientNote(null)
    if (!isValidAddress(payee)) { setRecipientNote('Enter a valid Celo address.'); return }
    if (chainId !== REQUIRED_CHAIN_ID) { setRecipientNote(WRONG_NETWORK); return }
    setRecipientBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: POLICY_ABI, functionName: 'setAllowlist',
        args: [payee, next], chainId: REQUIRED_CHAIN_ID, gas: SET_ALLOWLIST_GAS,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account, abi: POLICY_ABI, functionName: 'payeeAllowlist', args: [payee],
        }),
      ) === next)
      if (confirmed) {
        setPayeeAllowed(next)
        disarmRemove()
        setRecipientNote(next ? '✓ Recipient approved.' : '✓ Recipient removed.')
      } else {
        setRecipientNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      setRecipientNote('The transaction was not sent.')
    } finally {
      setRecipientBusy(false)
    }
  }

  /**
   * Closing throws away whatever is in the two fields. `dirty` already
   * existed -- it stops the chain overwriting a value mid-edit -- and was
   * never consulted here, so a half-typed daily limit vanished on a click
   * with nothing said. On the form that decides how much an agent may spend,
   * that is the wrong thing to do quietly.
   */
  function close() {
    // The browser's own dialog, not a modal of ours. design-system §6 lists
    // six primitives and says a screen needing a seventh has found a new
    // primitive, not a one-off -- and one confirm does not justify inventing
    // the app's first modal, its focus trap and its scrim.
    if (dirty && !window.confirm('Discard the unsaved spending limits?')) return
    setDirty(false)
    setError(null)
    disarmRemove()
    setOpen(false)
  }

  /**
   * Escape closes it. This is a disclosure rather than a modal -- it does not
   * cover the page and does not trap focus -- but it is a panel that opened,
   * and a reader who opened one expects Escape to be the way back out.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      // The arming hook owns Escape while a destructive control is armed:
      // cancelling that is the nearer of the two undos, and closing the panel
      // out from under the warning would be the wrong one.
      if (event.key === 'Escape' && !removeArmed) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // `close` is rebuilt every render, so it cannot be a dependency; these
    // three are everything it reads that changes.
  }, [open, removeArmed, dirty])

  return (
    <>
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls="protection-editor"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? 'Close protection editor' : 'Edit protection'}
      </Button>
      {open && (
        <Panel className="p-6 mt-3">
          <div id="protection-editor">
            {loading ? (
              <Label className="block">Reading the current limits…</Label>
            ) : (
              <>
                <Label className="block">Required</Label>
                <h2 className="mt-2" style={HEADING}>
                  Spending limits
                </h2>
                <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  Both limits apply to direct payments and agent top-ups.
                </p>

                <div className="grid gap-4 mt-5 sm:grid-cols-2">
                  <label>
                    <Label className="block">Per payment ({symbol})</Label>
                    <input
                      className="num field w-full mt-2 p-2"
                      aria-label={`Per transaction limit in ${symbol}`}
                      value={perTxInput}
                      onChange={(event) => { setDirty(true); setPerTx(event.target.value) }}
                      disabled={busy}
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <Label className="block">Per UTC day ({symbol})</Label>
                    <input
                      className="num field w-full mt-2 p-2"
                      aria-label={`Daily limit in ${symbol}`}
                      value={dailyInput}
                      onChange={(event) => { setDirty(true); setDaily(event.target.value) }}
                      disabled={busy}
                      inputMode="decimal"
                    />
                  </label>
                </div>
                {error && <p role="alert" className="text-sm mt-3" style={{ color: 'var(--bad)' }}>{error}</p>}
                <Button variant="primary" className="mt-4" disabled={busy} onClick={() => void saveLimits()}>
                  {busy ? 'Saving…' : 'Save limits'}
                </Button>

                <details className="mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
                  <summary className="cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: 'var(--text)' }}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Recipient protection</span>
                      <Label>{allowlistEnabled ? 'On' : 'Optional · Off'}</Label>
                    </span>
                  </summary>
                  <div className="pt-4">
                    <p className="text-sm" style={{ color: 'var(--dim)' }}>
                      {allowlistEnabled
                        ? 'Direct payments are limited to addresses approved on chain.'
                        : 'Direct payments may go to any address within the spending limits. This does not affect x402 after funds reach the agent wallet.'}
                    </p>

                    <Label className="block mt-4">Check one recipient address</Label>
                    <input
                      className="num field w-full mt-2 p-2"
                      aria-label="Recipient address"
                      placeholder="0x…"
                      value={payee}
                      onChange={(event) => {
                        setPayee(event.target.value)
                        setPayeeAllowed(null)
                        setRecipientNote(null)
                        disarmRemove()
                      }}
                      disabled={recipientBusy}
                    />
                    {/* Above the button, not below it. This warning is what the
                        first press exists to reveal, and a reader who has to
                        scan past the control to find it has already decided. */}
                    {removeArmed && (
                      <p role="alert" className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
                        Recipient protection is on. If this is the last approved
                        address, every direct payment will be refused until another
                        is approved — and the contract cannot be asked how many
                        remain. Press Escape to cancel.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {payeeAllowed === null ? (
                        <Button variant="ghost" disabled={recipientBusy} onClick={() => void checkPayee()}>
                          {recipientBusy ? 'Checking…' : 'Check address'}
                        </Button>
                      ) : payeeAllowed ? (
                        <Button
                          variant="stop"
                          disabled={recipientBusy}
                          onClick={() => (
                            !allowlistEnabled || removeArmed
                              ? void setPayeeAccess(false)
                              : armRemove(true)
                          )}
                        >
                          {recipientBusy ? 'Removing…' : removeArmed ? 'Confirm removal' : 'Remove address'}
                        </Button>
                      ) : (
                        <Button variant="primary" disabled={recipientBusy} onClick={() => void setPayeeAccess(true)}>
                          {recipientBusy ? 'Approving…' : 'Approve address'}
                        </Button>
                      )}
                      {payeeAllowed !== null && (
                        <span className="text-sm" style={{ color: payeeAllowed ? 'var(--ok)' : 'var(--dim)' }}>
                          {payeeAllowed ? 'Approved' : 'Not approved'}
                        </span>
                      )}
                    </div>

                    <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                      <p className="text-sm" style={{ color: 'var(--dim)' }}>
                        {!allowlistEnabled && payeeAllowed !== true
                          ? 'Check an approved address before turning protection on. An empty allowlist blocks every direct payment.'
                          : allowlistEnabled
                            ? 'Turning this off allows direct payments to any address within the limits.'
                            : 'At least one verified recipient is ready.'}
                      </p>
                      <Button
                        variant={allowlistEnabled ? 'stop' : 'ghost'}
                        className="mt-3"
                        disabled={recipientBusy || (!allowlistEnabled && payeeAllowed !== true)}
                        onClick={() => void setRecipientProtection(!allowlistEnabled)}
                      >
                        {allowlistEnabled ? 'Turn off recipient protection' : 'Turn on recipient protection'}
                      </Button>
                    </div>

                    {recipientNote && (
                      <p
                        role="status"
                        className="text-sm mt-3"
                        style={{ color: recipientNote.startsWith('✓') ? 'var(--ok)' : 'var(--bad)' }}
                      >
                        {recipientNote}
                      </p>
                    )}
                  </div>
                </details>
              </>
            )}
          </div>
        </Panel>
      )}
    </>
  )
}
