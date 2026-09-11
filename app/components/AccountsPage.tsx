'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import {
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type BaseError,
} from 'viem'
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
import { publicClient } from '../lib/chain.js'
import { describeDiscovery, type DiscoveredAccountCandidate } from '../lib/accountDiscovery.js'
import { HEADING } from './ui/prose'

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

/**
 * Whether a failed verification was the chain answering "no" or not answering.
 *
 * viem wraps BOTH in `ContractFunctionExecutionError`, so the error's own name
 * cannot tell them apart. Measured against viem in this package on 2026-09-09,
 * by cause chain:
 *
 *   no code at the address -> ContractFunctionZeroDataError
 *   a contract that reverts -> ContractFunctionRevertedError
 *   a node that did not answer -> HttpRequestError / TimeoutError
 *
 * Only the first two are the contract having answered. Everything else — an
 * unrecognised shape included — is treated as unread, deliberately: calling an
 * unread account "incompatible" hides somebody's money from them, while calling
 * a genuinely incompatible one "unread" only asks them to try again.
 */
function answeredByTheContract(error: unknown): boolean {
  const walk = (error as BaseError)?.walk
  if (typeof walk !== 'function') return false
  return (error as BaseError).walk(
    (e) => e instanceof ContractFunctionZeroDataError || e instanceof ContractFunctionRevertedError,
  ) !== null
}

async function verifyPolicyAccount(
  address: `0x${string}`,
  expectedOwner: `0x${string}`,
): Promise<'verified' | 'wrong-owner' | 'incompatible' | 'unreadable'> {
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
  } catch (error) {
    // A contract that answered "no" and a node that did not answer are
    // different facts. Collapsing them is how "we could not check" became
    // "you have no accounts": 40 candidates against a rate-limited forno all
    // came back 'incompatible', and the page told an owner with three
    // protected accounts that none existed.
    return answeredByTheContract(error) ? 'incompatible' : 'unreadable'
  }
}

export default function AccountsPage() {
  const { address: connected, isConnected } = useAccount()
  const [accounts, setAccounts] = useState<SavedPolicyAccount[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [discoveryNote, setDiscoveryNote] = useState<string | null>(null)
  // How many candidates the chain never answered for. Kept apart from the
  // note so the empty state can refuse to claim absence as well.
  const [unreadableCount, setUnreadableCount] = useState(0)

  useEffect(() => {
    if (!connected) {
      setAccounts([])
      setDiscoveryNote(null)
      setUnreadableCount(0)
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
    // A stale count would let the previous run's outage keep suppressing this
    // run's honest "none were found".
    setUnreadableCount(0)
    try {
      const response = await fetch(`/api/accounts/discover?owner=${encodeURIComponent(owner)}`, { signal })
      const body = await response.json() as {
        accounts?: DiscoveredAccountCandidate[]
        historyTruncated?: boolean
        code?: string
      }
      if (!response.ok || !Array.isArray(body.accounts)) {
        setDiscoveryNote(body.code === 'DISCOVERY_NOT_CONFIGURED'
          ? 'Automatic discovery is not configured. Add the explorer API key and refresh.'
          : 'Could not refresh account history. Showing the last saved list.')
        return
      }

      let discovered = 0
      // Counted, not collapsed into the miss count: a candidate the chain
      // never answered for has not been rejected, and the sentence below must
      // not imply it was.
      let unreadable = 0
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
          if (result === 'unreadable') { unreadable++; continue }
          if (result !== 'verified') continue
          savePolicyAccount(localStorage, owner, candidate)
          discovered++
        }
      }
      setAccounts(listPolicyAccounts(localStorage, owner))
      announceAccountRegistryChange()
      setUnreadableCount(unreadable)
      setDiscoveryNote(describeDiscovery({
        verified: discovered,
        unreadable,
        historyTruncated: Boolean(body.historyTruncated),
      }))
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
          <h1 style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-title)', color: 'var(--text)' }}>
            My protected accounts
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            Reopen accounts owned by this wallet or create another protected budget for an agent.
          </p>
        </header>

      {!isConnected ? (
        <Panel className="p-6">
          <h2 style={HEADING}>Connect the owner wallet</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
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
              <Button disabled={discovering} onClick={() => void discoverAccounts(connected!)}>
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
