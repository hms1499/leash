'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import ConnectButton from './ConnectButton'
import NetworkBadge from './NetworkBadge'
import Address from './ui/Address'
import ActionLink from './ui/ActionLink'
import AppHeader from './ui/AppHeader'
import Button from './ui/Button'
import Label from './ui/Label'
import Panel from './ui/Panel'
import { PAGE } from './ui/page'
import {
  announceAccountRegistryChange,
  listPolicyAccounts,
  migrateLegacyAccount,
  savePolicyAccount,
  type SavedPolicyAccount,
} from '../lib/accountRegistry.js'
import { describeDiscovery } from '../lib/accountDiscovery.js'
import { findOwnedAccounts } from '../lib/ownedAccounts.js'
import { HEADING, TITLE } from './ui/prose'
import { PROSE } from './ui/prose'

export default function AccountsPage() {
  const { address: connected, isConnected } = useAccount()
  const [accounts, setAccounts] = useState<SavedPolicyAccount[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [discoveryNote, setDiscoveryNote] = useState<string | null>(null)
  // How many candidates the chain never answered for. Kept apart from the
  // note so the empty state can refuse to claim absence as well.
  const [unreadableCount, setUnreadableCount] = useState(0)

  /**
   * The run in flight, whoever started it. The effect and the Refresh
   * button both go through startDiscovery, so a wallet switch aborts a
   * manual run too -- it used to finish and write the previous owner's
   * list onto this owner's screen.
   */
  const run = useRef<AbortController | null>(null)
  function startDiscovery(owner: `0x${string}`) {
    run.current?.abort()
    const controller = new AbortController()
    run.current = controller
    void discoverAccounts(owner, controller.signal)
  }

  useEffect(() => {
    if (!connected) {
      run.current?.abort()
      setAccounts([])
      setDiscoveryNote(null)
      setUnreadableCount(0)
      setDiscovering(false)
      return
    }
    setAccounts(migrateLegacyAccount(localStorage, connected))
    startDiscovery(connected)
    return () => run.current?.abort()
    // startDiscovery is rebuilt every render and reads only refs and setters.
  }, [connected])

  async function discoverAccounts(owner: `0x${string}`, signal: AbortSignal) {
    setDiscovering(true)
    setDiscoveryNote(null)
    // A stale count would let the previous run's outage keep suppressing this
    // run's honest "none were found".
    setUnreadableCount(0)
    try {
      const result = await findOwnedAccounts(owner, signal)
      if (result.status === 'aborted') return
      if (result.status !== 'ok') {
        setDiscoveryNote(result.status === 'not-configured'
          ? 'Automatic discovery is not configured. Add the explorer API key and refresh.'
          : 'Could not refresh account history. Showing the last saved list.')
        return
      }
      for (const candidate of result.verified) savePolicyAccount(localStorage, owner, candidate)
      setAccounts(listPolicyAccounts(localStorage, owner))
      announceAccountRegistryChange()
      setUnreadableCount(result.unreadable)
      setDiscoveryNote(describeDiscovery({
        verified: result.verified.length,
        unreadable: result.unreadable,
        historyTruncated: result.historyTruncated,
      }))
    } catch {
      // Only storage can throw here: findOwnedAccounts never does.
      setDiscoveryNote('Could not refresh account history. Showing the last saved list.')
    } finally {
      if (!signal.aborted) setDiscovering(false)
    }
  }

  function refresh() {
    if (!connected) return
    setAccounts(listPolicyAccounts(localStorage, connected))
    announceAccountRegistryChange()
  }

  return (
    <>
      {/* The network badge used to sit alone in this page's top right with
          nothing beside it saying it was a network. In the slot it shares with
          the dashboard's, it reads as the same thing it reads as there. */}
      <AppHeader
        actions={
          <>
            <NetworkBadge />
            {isConnected && <ConnectButton />}
          </>
        }
      />
      <main className={`${PAGE} py-12 space-y-6`}>
        <header>
          <h1 style={{ ...TITLE, color: 'var(--text)' }}>
            My protected accounts
          </h1>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            Reopen accounts owned by this wallet or create another protected budget for an agent.
          </p>
        </header>

      {!isConnected ? (
        <Panel className="p-6">
          <h2 style={HEADING}>Connect the owner wallet</h2>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            Each list is private to its owner wallet. Connect the wallet that created the account.
          </p>
          <div className="mt-4"><ConnectButton /></div>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <Label>{accounts.length} protected {accounts.length === 1 ? 'account' : 'accounts'}</Label>
              {discoveryNote && (
                <p role="status" className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  {discoveryNote}
                </p>
              )}
            </span>
            <span className="flex flex-wrap gap-2">
              <Button disabled={discovering} onClick={() => startDiscovery(connected!)}>
                {discovering ? 'Discovering…' : 'Refresh from Celo'}
              </Button>
            <ActionLink href="/setup?new=1" variant="primary">
              {accounts.length === 0 ? 'Create account' : 'Create another account'}
            </ActionLink>
            </span>
          </div>

          {accounts.length === 0 ? (
            <Panel className="p-6">
              <p className="text-sm">
                {discovering
                  ? 'Searching this owner’s deployment history for compatible protected accounts…'
                  // Suppressed while anything went unread. "None were found" is
                  // a statement about the chain, and a rate-limited RPC has not
                  // established it -- the note above already says how many
                  // could not be checked.
                  : unreadableCount > 0
                    ? 'No protected account could be confirmed. Some candidates could not be checked, so this is not yet an answer — try again in a moment.'
                    : 'No compatible protected accounts were found. Create one to get started.'}
              </p>
            </Panel>
          ) : (
            <div className="space-y-3">
              {accounts.map((account, index) => (
                <AccountRow
                  key={account.address}
                  account={account}
                  number={index + 1}
                />
              ))}
            </div>
          )}

          <p className="text-sm" style={{ color: 'var(--dim)' }}>
            Discovery uses indexed Celo transaction history and confirms every result against Celo RPC. It currently finds accounts deployed directly by the connected owner. Powered by{' '}
            <a href="https://celoscan.io" target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
              CeloScan
            </a>.
          </p>
        </>
      )}
      </main>
    </>
  )
}

function AccountRow({ account, number }: {
  account: SavedPolicyAccount
  number: number
}) {
  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="mt-1 break-words" style={HEADING}>
            Protected account {number}
          </h2>
          <div className="mt-2"><Address address={account.address} copy full className="num break-all text-left" /></div>
          {account.deployBlock && <Label className="block mt-2">Deployed at block {account.deployBlock}</Label>}
        </div>
        <ActionLink href={`/a/${account.address}`}>Open dashboard</ActionLink>
      </div>
    </Panel>
  )
}
