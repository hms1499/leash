'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { isValidAddress } from '../lib/address.js'
import { publicClient, REQUIRED_CHAIN_ID, SET_OPERATOR_GAS, WRONG_NETWORK } from '../lib/chain.js'
import { pollUntil } from '../lib/confirm.js'
import { useArming } from '../lib/arming.js'
import { readLocal, removeLocal, writeLocal } from '../lib/browserStorage.js'
import Address from './ui/Address'
import Button from './ui/Button'
import Label from './ui/Label'
import Panel from './ui/Panel'
import { HEADING } from './ui/prose'

const OPERATOR_ABI = [
  { type: 'function', name: 'setOperator', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'operators', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const

export default function AgentAccessPanel({
  account, operators, operatorLoading, isOwner, onAgentGranted, onAgentRevoked,
}: {
  account: `0x${string}`
  /**
   * Every operator this account could be verified to have, newest first.
   *
   * A list, because `operators` is a mapping and cannot be enumerated: the
   * dashboard assembles candidates from OperatorChanged history and checks
   * each against operators(). Showing only the newest -- which this panel did
   * until 2026-09-09 -- let an owner revoke the one on screen, read "no
   * operator", and leave a second key spending to the daily cap.
   */
  operators: readonly `0x${string}`[]
  operatorLoading: boolean
  isOwner: boolean
  onAgentGranted: (operator: `0x${string}`) => void
  onAgentRevoked: (operator: `0x${string}`) => void
}) {
  const [agentInput, setAgentInput] = useState('')
  const [busy, setBusy] = useState(false)
  // Which row is armed, by address: one shared boolean would arm every
  // Revoke button at once on a multi-operator account.
  // The third caller of the same two-beat confirm, and the one that made the
  // hook hold a target rather than a flag: this arms one operator out of a
  // row of them.
  const { armed: arming, arm: armRevoke, disarm: disarmRevoke } = useArming<string>()
  const [note, setNote] = useState<string | null>(null)
  const { address: connected, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()

  useEffect(() => {
    // The grant form only appears when the list is empty, so there is nothing
    // to prefill it with. It used to echo the single operator back.
    if (operators.length > 0) setAgentInput('')
  }, [operators.length])

  async function grantAccess() {
    setNote(null)
    if (!isValidAddress(agentInput)) { setNote('Enter a valid Celo address.'); return }
    if (connected && agentInput.toLowerCase() === connected.toLowerCase()) {
      setNote('Use a separate agent wallet. The owner wallet must not also be the agent.')
      return
    }
    if (operators.some((o) => o.toLowerCase() === agentInput.toLowerCase())) {
      setNote('That wallet is already an authorised agent on this account.')
      return
    }
    if (chainId !== REQUIRED_CHAIN_ID) { setNote(WRONG_NETWORK); return }

    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: OPERATOR_ABI, functionName: 'setOperator',
        args: [agentInput, true], chainId: REQUIRED_CHAIN_ID, gas: SET_OPERATOR_GAS,
      })
      const confirmed = await pollUntil(async () => Boolean(
        await publicClient.readContract({
          address: account, abi: OPERATOR_ABI, functionName: 'operators', args: [agentInput],
        }),
      ))
      if (confirmed) {
        const next = agentInput as `0x${string}`
        writeLocal(`leash.agent.${account.toLowerCase()}`, next)
        setNote('✓ Agent access granted.')
        onAgentGranted(next)
      } else {
        setNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      setNote('The transaction was not sent.')
    } finally {
      setBusy(false)
    }
  }

  async function revokeAccess(operator: `0x${string}`) {
    setNote(null)
    if (chainId !== REQUIRED_CHAIN_ID) { setNote(WRONG_NETWORK); return }

    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: OPERATOR_ABI, functionName: 'setOperator',
        args: [operator, false], chainId: REQUIRED_CHAIN_ID, gas: SET_OPERATOR_GAS,
      })
      const confirmed = await pollUntil(async () => !Boolean(
        await publicClient.readContract({
          address: account, abi: OPERATOR_ABI, functionName: 'operators', args: [operator],
        }),
      ))
      if (confirmed) {
        const stored = readLocal(`leash.agent.${account.toLowerCase()}`)
        if (stored?.toLowerCase() === operator.toLowerCase()) {
          removeLocal(`leash.agent.${account.toLowerCase()}`)
        }
        setNote('✓ Agent access revoked.')
        onAgentRevoked(operator)
      } else {
        setNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      setNote('The transaction was not sent.')
    } finally {
      setBusy(false)
      disarmRevoke()
    }
  }

  return (
    <Panel as="section" className="p-6">
      <Label className="block">Agent</Label>
      <h2
        className="mt-2"
        style={{ ...HEADING, color: 'var(--text)' }}
      >
        Agent permissions
      </h2>

      {operatorLoading ? (
        <p className="text-sm mt-4" style={{ color: 'var(--dim)' }}>
          Checking operator access on chain…
        </p>
      ) : operators.length > 0 ? (
        <>
          <div className="mt-4 space-y-3">
            {operators.map((op) => (
              <div
                key={op}
                className="flex flex-col gap-3 rounded p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ background: 'var(--well)', border: '1px solid var(--line)' }}
              >
                <div>
                  <Label className="block" style={{ color: 'var(--ok)' }}>Authorized</Label>
                  <p className="mt-2"><Address address={op} copy explorer className="num" /></p>
                </div>
                {isOwner && (
                  <Button
                    variant="stop"
                    disabled={busy}
                    onClick={() => (
                      arming === op ? void revokeAccess(op) : armRevoke(op)
                    )}
                  >
                    {busy && arming === op
                      ? 'Revoking…'
                      : arming === op ? 'Confirm revoke' : 'Revoke access'}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm mt-3" style={{ color: 'var(--dim)' }}>
            {operators.length === 1
              ? 'This wallet can request policy-bounded payments. To use another agent, revoke this wallet first; its existing wallet balance will not move.'
              : `All ${operators.length} of these wallets can request policy-bounded payments, and each spends against the same daily cap. Revoking one does not affect the others.`}
          </p>
          {/* The list is what could be VERIFIED, not what exists. See
              liveOperators in lib/feed.ts: the history is read over 24 hours,
              and a mapping cannot be enumerated. */}
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            Assembled from this account&apos;s recent activity and confirmed
            against the contract. The contract cannot be asked to list its
            operators, so one authorised earlier and never used may not appear
            here.
          </p>
        </>
      ) : isOwner ? (
        <>
          <p className="text-sm mt-3" style={{ color: 'var(--dim)' }}>
            No operator was found in this account&apos;s recent activity — the
            contract cannot be asked to list its operators, so one authorised
            earlier may not appear here. Grant a separate hot wallet permission
            to request payments; it cannot change policy, resume the account or
            recover protected funds.
          </p>
          <Label className="block mt-4">Agent wallet address</Label>
          <input
            className="num field w-full mt-2 p-2"
            aria-label="Agent wallet address"
            placeholder="0x…"
            value={agentInput}
            onChange={(event) => { setAgentInput(event.target.value); setNote(null) }}
            disabled={busy}
          />
          <Button variant="primary" className="mt-3" disabled={busy} onClick={() => void grantAccess()}>
            {busy ? 'Granting…' : 'Grant access'}
          </Button>
        </>
      ) : (
        <p className="text-sm mt-3" style={{ color: 'var(--dim)' }}>
          No operator was found in this account&apos;s recent activity. The
          contract cannot be asked to list its operators, so one authorised
          earlier may not appear here. Connect the owner wallet to grant access.
        </p>
      )}

      {note && (
        <p
          role="status"
          className="text-sm mt-3"
          style={{ color: note.startsWith('✓') ? 'var(--ok)' : 'var(--bad)' }}
        >
          {note}
        </p>
      )}
    </Panel>
  )
}
