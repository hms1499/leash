'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import {
  ACCEPT_OWNERSHIP_GAS, publicClient, REQUIRED_CHAIN_ID, TRANSFER_OWNERSHIP_GAS, WRONG_NETWORK,
} from '../lib/chain.js'
import { isValidAddress } from '../lib/address.js'
import { ownershipRole } from '../lib/policy.js'
import { pollUntil } from '../lib/confirm.js'
import { noteForWallet, type WalletNote } from '../lib/walletNote.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import Button from './ui/Button'
import Address from './ui/Address'
import { HEADING, PROSE } from './ui/prose'

const OWNERSHIP_ABI = [
  { type: 'function', name: 'transferOwnership', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }], outputs: [] },
  { type: 'function', name: 'acceptOwnership', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pendingOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

const ZERO = '0x0000000000000000000000000000000000000000' as const

type Props = {
  account: `0x${string}`
  owner: `0x${string}` | null
  pendingOwner: `0x${string}` | null
  connected: `0x${string}` | undefined
  onChanged: () => void
}

/**
 * Transfer for the owner, Accept for the nominee.
 *
 * `acceptOwnership` is the only write in this app whose caller is deliberately
 * not the owner, so this component cannot hang off `canEdit` the way every
 * other control does -- doing that would hide Accept from the one wallet that
 * can use it. `ownershipRole` decides, from `owner()` and `pendingOwner()` read
 * off the chain.
 *
 * A stranger gets nothing rendered at all rather than a disabled control: a
 * dead button still says something about an account that is none of their
 * business.
 */
export default function OwnershipDrawer(
  { account, owner, pendingOwner, connected, onChanged }: Props,
) {
  const role = ownershipRole(owner, pendingOwner, connected)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  // Scoped to the wallet that caused it: an account switch in MetaMask does
  // not remount this component, so a bare string outlives the wallet it
  // describes. See lib/walletNote.ts — measured on mainnet during a hand-back.
  const [rawNote, setRawNote] = useState<WalletNote>(null)
  const { writeContractAsync } = useWriteContract()
  const { chainId } = useAccount()

  // A nomination outstanding to somebody. ZERO is the contract's "nobody",
  // and it is also what a cancel writes, so the two are the same state.
  const note = noteForWallet(rawNote, connected)
  const nominated = pendingOwner !== null && pendingOwner !== ZERO

  /**
   * Escape closes it, as it does the protection editor. A disclosure rather
   * than a modal -- nothing is covered and focus is not trapped -- but a
   * reader who opened a panel expects Escape to be the way back out.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (role === 'none') return null

  async function write(
    fn: 'transferOwnership' | 'acceptOwnership',
    arg: `0x${string}` | null,
    gas: bigint,
  ) {
    const say = (text: string) => setRawNote({ text, wallet: connected! })
    setRawNote(null)
    if (!connected) return
    // Before the wallet, never after: a guard that opens a wallet prompt and
    // then refuses leaves a person cancelling a dialogue they did not ask for.
    if (chainId !== REQUIRED_CHAIN_ID) { say(WRONG_NETWORK); return }
    if (arg !== null && arg !== ZERO && !isValidAddress(arg)) {
      say('That is not a valid address.'); return
    }
    setBusy(true)
    try {
      try {
        await writeContractAsync({
          address: account, abi: OWNERSHIP_ABI, functionName: fn,
          ...(arg === null ? {} : { args: [arg] }),
          chainId: REQUIRED_CHAIN_ID, gas,
        } as never)
      } catch {
        say('The transaction was not sent.'); return
      }
      // The condition, not the receipt. forno is load-balanced and serves
      // stale reads after a confirmed transaction, and
      // waitForTransactionReceipt resolves on revert besides.
      const confirmed = await pollUntil(async () => {
        const read = await publicClient.readContract({
          address: account, abi: OWNERSHIP_ABI,
          functionName: fn === 'acceptOwnership' ? 'owner' : 'pendingOwner',
        }) as string
        const want = fn === 'acceptOwnership' ? connected! : (arg ?? ZERO)
        return read.toLowerCase() === want.toLowerCase()
      })
      if (confirmed) {
        setTo('')
        say(fn === 'acceptOwnership'
          ? '✓ You now own this account.'
          : arg === ZERO ? '✓ Nomination cancelled.' : '✓ Nomination saved.')
        onChanged()
      } else {
        say('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } finally { setBusy(false) }
  }

  const noteTone = note !== null && note.startsWith('✓') ? 'var(--ok)' : 'var(--bad)'

  // The nominee gets one button and the sentence explaining why they have it.
  // No transfer form: a nominee is not yet an owner, and the contract would
  // refuse the write.
  if (role === 'incoming') {
    return (
      <Panel className="p-6 mt-6">
        <Label className="block">Ownership</Label>
        <h2 className="mt-2" style={HEADING}>This account was offered to you</h2>
        <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
          The current owner nominated this wallet. Nothing changes until you accept; once you do,
          you hold every control on this account, including sweeping its balance.
        </p>
        <Button variant="primary" className="mt-3" disabled={busy}
          onClick={() => void write('acceptOwnership', null, ACCEPT_OWNERSHIP_GAS)}>
          {busy ? 'Accepting…' : 'Accept ownership'}
        </Button>
        {note && <p role="status" className="mt-3" style={{ ...PROSE, color: noteTone }}>{note}</p>}
      </Panel>
    )
  }

  return (
    <>
      <Button variant="ghost" aria-expanded={open} aria-controls="ownership-editor"
        onClick={() => setOpen(!open)}>
        {open ? 'Close ownership' : 'Transfer ownership'}
      </Button>
      {open && (
        // Expands in flow and pushes what is below it down: §13 has no layer
        // above the page. motion-reveal is §12's 90ms for a disclosure.
        <Panel className="motion-reveal p-6 mt-3">
          <div id="ownership-editor">
            <Label className="block">Irreversible once accepted</Label>
            <h2 className="mt-2" style={HEADING}>Transfer ownership</h2>
            <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
              The new owner gets every control on this account: the limits, the pause, the operator
              list, and <strong>sweep</strong>, which moves the balance anywhere. Nothing changes
              until they accept from their own wallet — which is what makes a mistyped address
              recoverable here, and only here.
            </p>

            <Label className="block mt-6">New owner address</Label>
            <input className="num field w-full mt-2 p-2" aria-label="New owner address"
              placeholder="0x…" value={to} disabled={busy}
              onChange={(event) => { setTo(event.target.value); setRawNote(null) }} />
            <Button variant="primary" className="mt-3" disabled={busy}
              onClick={() => void write('transferOwnership', to as `0x${string}`, TRANSFER_OWNERSHIP_GAS)}>
              {busy ? 'Nominating…' : 'Nominate new owner'}
            </Button>

            {nominated && (
              <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
                <Label className="block">Waiting to be accepted</Label>
                <div className="mt-2">
                  <Address address={pendingOwner!} copy explorer />
                </div>
                <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
                  You are still the owner until this wallet accepts. Cancelling costs one
                  transaction and takes the offer back.
                </p>
                <Button variant="stop" className="mt-3" disabled={busy}
                  onClick={() => void write('transferOwnership', ZERO, TRANSFER_OWNERSHIP_GAS)}>
                  {busy ? 'Cancelling…' : 'Cancel nomination'}
                </Button>
              </div>
            )}

            {note && <p role="status" className="mt-3" style={{ ...PROSE, color: noteTone }}>{note}</p>}
          </div>
        </Panel>
      )}
    </>
  )
}
