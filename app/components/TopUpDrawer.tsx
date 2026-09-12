'use client'

import { useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, SET_TOP_UP_ENABLED_GAS, WRONG_NETWORK } from '../lib/chain.js'
import { pollUntil } from '../lib/confirm.js'
import { useArming } from '../lib/arming.js'
import { describeTopUpState, topUpNeedsArming } from '../lib/topUp.js'
import { noteForWallet, type WalletNote } from '../lib/walletNote.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import Button from './ui/Button'
import { HEADING, PROSE } from './ui/prose'

const TOP_UP_ABI = [
  { type: 'function', name: 'setTopUpEnabled', stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'topUpEnabled', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
] as const

/**
 * The owner's control over agent-funded payments, on the dashboard.
 *
 * The wizard asks this question once, at setup. Administration lives here —
 * the same argument that puts ownership transfer on the dashboard rather than
 * in the wizard. Without it an owner who wants to close this path after setup
 * has nowhere to do it but walk back into a wizard they have finished, and
 * the switch that most deserves a second thought is the one that was hardest
 * to reach.
 *
 * `topUpEnabled` was already being read by useAccountState every four seconds
 * and rendered nowhere. This is what that read was for.
 */
export default function TopUpDrawer({
  account, enabled, isOwner, loading, onChanged,
}: {
  account: `0x${string}`
  enabled: boolean
  isOwner: boolean
  loading: boolean
  onChanged: () => void
}) {
  const { armed, arm, disarm } = useArming()
  const [busy, setBusy] = useState(false)
  // Scoped to the wallet that caused it, for the reason OwnershipDrawer is:
  // an account switch does not remount this, so a bare string outlives the
  // wallet it describes. Fixing one of a pair and not the other is what
  // CLAUDE.md forbids by name.
  const [rawNote, setRawNote] = useState<WalletNote>(null)
  const { writeContractAsync } = useWriteContract()
  const { address: connected, chainId } = useAccount()
  const note = noteForWallet(rawNote, connected)

  // A non-owner gets the state and no control. The state is not private — it
  // is the single most useful thing this panel can tell someone deciding
  // whether to trust an account — but `loading` must win over it, or a
  // visitor reads "Off" for something nobody has checked yet.
  if (!isOwner) {
    return (
      <Panel as="section" className="p-6 mt-3">
        <Label className="block">Agent-funded payments</Label>
        <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
          {describeTopUpState(loading ? null : enabled)}
        </p>
      </Panel>
    )
  }

  async function send(next: boolean) {
    const say = (text: string) => setRawNote(connected ? { text, wallet: connected } : null)
    setRawNote(null)
    // Before the wallet, never after: a guard that opens a wallet prompt and
    // then refuses leaves a person cancelling a dialogue they did not ask for.
    if (chainId !== REQUIRED_CHAIN_ID) { say(WRONG_NETWORK); return }
    // A poll satisfied on its first iteration confirms nothing. This is the
    // same guard protectRecipient carries in the wizard, for the same reason:
    // it once reported success for a transaction that never existed.
    if (next === enabled) {
      say(next
        ? 'Agent-funded payments are already on — nothing to change.'
        : 'Agent-funded payments are already off — nothing to change.')
      return
    }
    setBusy(true)
    try {
      try {
        await writeContractAsync({
          address: account, abi: TOP_UP_ABI, functionName: 'setTopUpEnabled',
          args: [next], chainId: REQUIRED_CHAIN_ID, gas: SET_TOP_UP_ENABLED_GAS,
        })
      } catch {
        say('The transaction was not sent.'); return
      }
      // The condition, not the receipt. forno is load-balanced and serves
      // stale reads after a confirmed transaction.
      const confirmed = await pollUntil(async () => (
        await publicClient.readContract({
          address: account, abi: TOP_UP_ABI, functionName: 'topUpEnabled',
        }) as boolean
      ) === next)
      if (confirmed) {
        disarm()
        say(next ? '✓ Agent-funded payments turned on.' : '✓ Agent-funded payments turned off.')
        onChanged()
      } else {
        say('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } finally { setBusy(false) }
  }

  const next = !enabled
  const arming = topUpNeedsArming(next)

  function press() {
    if (!arming || armed) { void send(next); return }
    arm(true)
  }

  return (
    <Panel as="section" className="p-6 mt-3">
      <Label className="block">Agent-funded payments</Label>
      <h2 className="mt-2" style={HEADING}>
        {loading ? 'Reading the current setting…' : enabled ? 'On' : 'Off'}
      </h2>
      <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
        {describeTopUpState(loading ? null : enabled)}
        {enabled
          ? ' Recipient restrictions do not apply once funds reach that wallet — only the daily cap does.'
          : ' x402 APIs the agent pays for itself need this on.'}
      </p>

      {/* Above the button, not below it: this warning is what the first press
          exists to reveal, and a reader who has to scan past the control to
          find it has already decided. */}
      {armed && (
        <p role="alert" className="mt-3" style={{ ...PROSE, color: 'var(--bad)' }}>
          This opens the one path out of this account the approved-recipient list
          cannot reach. The agent will be able to move up to the daily cap into
          its own wallet and spend it anywhere, and a leaked agent key can do the
          same. Press Escape to cancel.
        </p>
      )}

      <Button
        variant={enabled ? 'stop' : 'ghost'}
        className="mt-3"
        disabled={busy || loading}
        onClick={press}
      >
        {busy
          ? 'Saving…'
          : enabled
            ? 'Turn off agent-funded payments'
            : armed ? 'Confirm — allow agent-funded payments' : 'Allow agent-funded payments'}
      </Button>

      {note && (
        <p role="status" className="mt-3"
          style={{ ...PROSE, color: note.startsWith('✓') ? 'var(--ok)' : 'var(--bad)' }}>
          {note}
        </p>
      )}
    </Panel>
  )
}
