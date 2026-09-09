'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { isValidAddress } from '../lib/address.js'
import { publicClient, REQUIRED_CHAIN_ID, SET_OPERATOR_GAS, WRONG_NETWORK } from '../lib/chain.js'
import { pollUntil } from '../lib/confirm.js'
import { readLocal, removeLocal, writeLocal } from '../lib/browserStorage.js'
import Address from './ui/Address'
import Button from './ui/Button'
import Label from './ui/Label'
import Panel from './ui/Panel'

const OPERATOR_ABI = [
  { type: 'function', name: 'setOperator', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'operators', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const

export default function AgentAccessPanel({
  account, operator, operatorLoading, isOwner, onAgentChanged,
}: {
  account: `0x${string}`
  operator: `0x${string}` | null
  operatorLoading: boolean
  isOwner: boolean
  onAgentChanged: (operator: `0x${string}` | null) => void
}) {
  const [agentInput, setAgentInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [arming, setArming] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { address: connected, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()

  useEffect(() => {
    if (operator) setAgentInput(operator)
    else setAgentInput('')
  }, [operator])

  async function grantAccess() {
    setNote(null)
    if (!isValidAddress(agentInput)) { setNote('Enter a valid Celo address.'); return }
    if (connected && agentInput.toLowerCase() === connected.toLowerCase()) {
      setNote('Use a separate agent wallet. The owner wallet must not also be the agent.')
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
        onAgentChanged(next)
      } else {
        setNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      setNote('The transaction was not sent.')
    } finally {
      setBusy(false)
    }
  }

  async function revokeAccess() {
    if (!operator) return
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
        onAgentChanged(null)
      } else {
        setNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } catch {
      setNote('The transaction was not sent.')
    } finally {
      setBusy(false)
      setArming(false)
    }
  }

  return (
    <Panel as="section" className="p-6">
      <Label className="block">Agent</Label>
      <h2
        className="mt-2"
        style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)', color: 'var(--text)' }}
      >
        Agent permissions
      </h2>

      {operatorLoading ? (
        <p className="text-sm mt-4" style={{ color: 'var(--dim)' }}>
          Checking operator access on chain…
        </p>
      ) : operator ? (
        <>
          <div
            className="mt-4 flex flex-col gap-3 rounded p-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ background: 'var(--well)', border: '1px solid var(--line)' }}
          >
            <div>
              <Label className="block" style={{ color: 'var(--ok)' }}>Authorized</Label>
              <p className="mt-2"><Address address={operator} copy explorer className="num" /></p>
            </div>
            {isOwner && (
              <Button
                variant="stop"
                disabled={busy}
                onBlur={() => setArming(false)}
                onClick={() => (arming ? void revokeAccess() : setArming(true))}
              >
                {busy ? 'Revoking…' : arming ? 'Confirm revoke' : 'Revoke access'}
              </Button>
            )}
          </div>
          <p className="text-sm mt-3" style={{ color: 'var(--dim)' }}>
            This wallet can request policy-bounded payments. To use another
            agent, revoke this wallet first; its existing wallet balance will not move.
          </p>
        </>
      ) : isOwner ? (
        <>
          <p className="text-sm mt-3" style={{ color: 'var(--dim)' }}>
            Grant one separate hot wallet permission to request payments. It
            cannot change policy, resume the account or recover protected funds.
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
          No agent wallet is currently verified. Connect the owner wallet to grant access.
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
