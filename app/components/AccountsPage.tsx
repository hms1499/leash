'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import ConnectButton from './ConnectButton'
import NetworkBadge from './NetworkBadge'
import Address from './ui/Address'
import Button from './ui/Button'
import Label from './ui/Label'
import Panel from './ui/Panel'
import { PAGE } from './ui/page'
import { isValidAddress } from '../lib/address.js'
import {
  announceAccountRegistryChange,
  listPolicyAccounts,
  migrateLegacyAccount,
  savePolicyAccount,
  updatePolicyAccountLabel,
  type SavedPolicyAccount,
} from '../lib/accountRegistry.js'
import { publicClient } from '../lib/chain.js'
import type { DiscoveredAccountCandidate } from '../lib/accountDiscovery.js'

const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const VERIFY_ABI = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowlistEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'remainingToday', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'operators', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'limits', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'perTx', type: 'uint256' }, { name: 'daily', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' }, { name: 'day', type: 'uint64' },
    ] },
] as const

async function verifyPolicyAccount(
  address: `0x${string}`,
  expectedOwner: `0x${string}`,
): Promise<'verified' | 'wrong-owner' | 'incompatible'> {
  try {
    const [owner] = await Promise.all([
      publicClient.readContract({ address, abi: VERIFY_ABI, functionName: 'owner' }),
      publicClient.readContract({ address, abi: VERIFY_ABI, functionName: 'paused' }),
      publicClient.readContract({ address, abi: VERIFY_ABI, functionName: 'allowlistEnabled' }),
      publicClient.readContract({ address, abi: VERIFY_ABI, functionName: 'limits', args: [TOKEN] }),
      publicClient.readContract({ address, abi: VERIFY_ABI, functionName: 'remainingToday', args: [TOKEN] }),
      publicClient.readContract({ address, abi: VERIFY_ABI, functionName: 'operators', args: [expectedOwner] }),
    ])
    return (owner as string).toLowerCase() === expectedOwner.toLowerCase()
      ? 'verified'
      : 'wrong-owner'
  } catch {
    return 'incompatible'
  }
}

export default function AccountsPage() {
  const { address: connected, isConnected } = useAccount()
  const [accounts, setAccounts] = useState<SavedPolicyAccount[]>([])
  const [candidate, setCandidate] = useState('')
  const [importLabel, setImportLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryNote, setDiscoveryNote] = useState<string | null>(null)

  useEffect(() => {
    if (!connected) {
      setAccounts([])
      setDiscoveryNote(null)
      setDiscovering(false)
      return
    }
    setAccounts(migrateLegacyAccount(localStorage, connected))
    const controller = new AbortController()
    void discoverAccounts(connected, controller.signal)
    return () => controller.abort()
  }, [connected])

  async function discoverAccounts(owner: `0x${string}`, signal?: AbortSignal) {
    setDiscovering(true)
    setDiscoveryNote(null)
    try {
      const response = await fetch(`/api/accounts/discover?owner=${encodeURIComponent(owner)}`, { signal })
      const body = await response.json() as {
        accounts?: DiscoveredAccountCandidate[]
        historyTruncated?: boolean
        code?: string
      }
      if (!response.ok || !Array.isArray(body.accounts)) {
        setDiscoveryNote(body.code === 'DISCOVERY_NOT_CONFIGURED'
          ? 'Automatic discovery needs an explorer API key. Saved accounts and manual import still work.'
          : 'Could not refresh account history. Showing the last saved list.')
        return
      }

      let discovered = 0
      // Bound RPC concurrency: an active owner can have many unrelated
      // deployments, and they are only candidates until each one passes all
      // three Leash reads and owner verification.
      for (let start = 0; start < body.accounts.length; start += 5) {
        const batch = body.accounts.slice(start, start + 5)
        const results = await Promise.all(batch.map(async (candidate) => ({
          candidate,
          result: await verifyPolicyAccount(candidate.address, owner),
        })))
        if (signal?.aborted) return
        for (const { candidate, result } of results) {
          if (result !== 'verified') continue
          savePolicyAccount(localStorage, owner, candidate)
          discovered++
        }
      }
      setAccounts(listPolicyAccounts(localStorage, owner))
      announceAccountRegistryChange()
      setDiscoveryNote(
        `${discovered} ${discovered === 1 ? 'account' : 'accounts'} verified from Celo history.` +
        (body.historyTruncated ? ' Older history may require manual import.' : ''),
      )
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setDiscoveryNote('Could not refresh account history. Showing the last saved list.')
      }
    } finally {
      if (!signal?.aborted) setDiscovering(false)
    }
  }

  function refresh() {
    if (!connected) return
    setAccounts(listPolicyAccounts(localStorage, connected))
    announceAccountRegistryChange()
  }

  async function importAccount() {
    setNote(null)
    if (!connected) { setNote('Connect the owner wallet first.'); return }
    if (!isValidAddress(candidate)) { setNote('Enter a valid Celo address.'); return }
    if (accounts.some((item) => item.address.toLowerCase() === candidate.toLowerCase())) {
      setNote('This account is already saved on this device.')
      return
    }
    setBusy(true)
    try {
      const result = await verifyPolicyAccount(candidate, connected)
      if (result === 'wrong-owner') {
        setNote('The connected wallet does not own this policy account.')
        return
      }
      if (result === 'incompatible') {
        setNote('Could not verify this as a compatible Leash policy account on Celo.')
        return
      }
      savePolicyAccount(localStorage, connected, { address: candidate, label: importLabel })
      setCandidate('')
      setImportLabel('')
      setNote('Account verified and saved on this device.')
      refresh()
    } catch {
      setNote('Could not verify this as a compatible Leash policy account on Celo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={`${PAGE} py-10 space-y-6`}>
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-title)', color: 'var(--celo)' }}>
            My policy accounts
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            Leash finds accounts deployed by the connected owner, verifies them on Celo, and caches the list on this device.
          </p>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          <NetworkBadge />
          <ConnectButton />
        </span>
      </header>

      {!isConnected ? (
        <Panel className="p-6">
          <h2 style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)' }}>Connect the owner wallet</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            The saved list is separated by owner, so Leash needs to know which wallet to show.
          </p>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <Label>{accounts.length} verified {accounts.length === 1 ? 'account' : 'accounts'}</Label>
              {discoveryNote && (
                <p role="status" className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
                  {discoveryNote}
                </p>
              )}
            </span>
            <span className="flex flex-wrap gap-2">
              <Button disabled={discovering} onClick={() => void discoverAccounts(connected!)}>
                {discovering ? 'Discovering…' : 'Refresh from Celo'}
              </Button>
            <Link
              href="/setup?new=1"
              className="rounded px-4 py-2"
              style={{ background: 'var(--celo)', color: 'var(--bg)', fontFamily: 'var(--mono)', fontSize: 'var(--t-data)', fontWeight: 700 }}
            >
              Create another account
            </Link>
            </span>
          </div>

          {accounts.length === 0 ? (
            <Panel className="p-6">
              <p className="text-sm">
                {discovering
                  ? 'Searching this owner’s deployment history and verifying policy accounts…'
                  : 'No compatible policy accounts were found. You can create one or import an address manually.'}
              </p>
            </Panel>
          ) : (
            <div className="space-y-3">
              {accounts.map((account, index) => (
                <AccountRow
                  key={account.address}
                  account={account}
                  number={index + 1}
                  onSaveLabel={(label) => {
                    updatePolicyAccountLabel(localStorage, connected!, account.address, label)
                    refresh()
                  }}
                />
              ))}
            </div>
          )}

          <Panel as="section" className="p-6">
            <h2 style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)' }}>Import an existing account</h2>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
              Use this after changing browser or device. Leash verifies the connected wallet owns the account and that its policy interface is compatible.
            </p>
            <Label className="block mt-4">Policy account address</Label>
            <input
              className="field num w-full mt-2 p-2"
              aria-label="Policy account address"
              placeholder="0x…"
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              disabled={busy}
            />
            <Label className="block mt-3">Local label — optional</Label>
            <input
              className="field w-full mt-2 p-2"
              aria-label="Local account label"
              placeholder="e.g. Research agent"
              maxLength={48}
              value={importLabel}
              onChange={(event) => setImportLabel(event.target.value)}
              disabled={busy}
            />
            <Button variant="primary" className="mt-3" disabled={busy} onClick={() => void importAccount()}>
              {busy ? 'Verifying…' : 'Verify and import'}
            </Button>
            {note && (
              <p role="status" className="text-sm mt-3" style={{
                color: note === 'Account verified and saved on this device.' ? 'var(--ok)' : 'var(--bad)',
              }}>
                {note}
              </p>
            )}
          </Panel>

          <p className="text-sm" style={{ color: 'var(--dim)' }}>
            Discovery uses indexed Celo transaction history, then verifies every result against Celo RPC. Manual import remains available for deployments made through another wallet or relayer. Powered by{' '}
            <a href="https://celoscan.io" target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
              CeloScan
            </a>.
          </p>
        </>
      )}
    </main>
  )
}

function AccountRow({
  account, number, onSaveLabel,
}: {
  account: SavedPolicyAccount
  number: number
  onSaveLabel: (label: string) => void
}) {
  const [label, setLabel] = useState(account.label ?? '')
  useEffect(() => { setLabel(account.label ?? '') }, [account.label])

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <Label>Account {number}</Label>
          <h2 className="mt-1 break-words" style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)' }}>
            {account.label || 'Unnamed policy account'}
          </h2>
          <div className="mt-2"><Address address={account.address} copy full className="num" /></div>
          {account.deployBlock && <Label className="block mt-2">Deployed at block {account.deployBlock}</Label>}
        </div>
        <Link
          href={`/a/${account.address}`}
          className="rounded px-4 py-2"
          style={{ border: '1px solid var(--line-control)', fontFamily: 'var(--mono)', fontSize: 'var(--t-data)' }}
        >
          Open dashboard
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-2 mt-4">
        <span className="flex-1" style={{ minWidth: '14rem' }}>
          <Label className="block">Local label</Label>
          <input
            className="field w-full mt-2 p-2"
            aria-label={`Local label for ${account.address}`}
            maxLength={48}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </span>
        <Button onClick={() => onSaveLabel(label)}>Save label</Button>
      </div>
    </Panel>
  )
}
