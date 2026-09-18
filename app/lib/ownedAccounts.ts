import {
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type BaseError,
} from 'viem'
import { publicClient } from './chain.js'
import type { DiscoveredAccountCandidate } from './accountDiscovery.js'
import { CELO_USDC } from '@leash/sdk'

/**
 * USDC on Celo mainnet. One literal, in `@leash/sdk`, because this line was
 * four separate copies of the same 42 characters and the MCP server asked
 * every user to paste a fifth by hand.
 */
const TOKEN = CELO_USDC
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

export type Verification = 'verified' | 'wrong-owner' | 'incompatible' | 'unreadable'

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
export function answeredByTheContract(error: unknown): boolean {
  const walk = (error as BaseError)?.walk
  if (typeof walk !== 'function') return false
  return (error as BaseError).walk(
    (e) => e instanceof ContractFunctionZeroDataError || e instanceof ContractFunctionRevertedError,
  ) !== null
}

export async function verifyPolicyAccount(
  address: `0x${string}`,
  expectedOwner: `0x${string}`,
): Promise<Verification> {
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

export type OwnedAccountsResult =
  | { status: 'aborted' }
  | { status: 'not-configured' }
  | { status: 'failed' }
  | {
      status: 'ok'
      verified: DiscoveredAccountCandidate[]
      unreadable: number
      historyTruncated: boolean
    }

type DiscoverBody = {
  accounts?: DiscoveredAccountCandidate[]
  historyTruncated?: boolean
  code?: string
}

type Deps = {
  fetchCandidates?: (owner: `0x${string}`, signal: AbortSignal) => Promise<{ ok: boolean; body: DiscoverBody }>
  verify?: (address: `0x${string}`, owner: `0x${string}`) => Promise<Verification>
}

async function fetchDiscover(owner: `0x${string}`, signal: AbortSignal) {
  const response = await fetch(`/api/accounts/discover?owner=${encodeURIComponent(owner)}`, { signal })
  return { ok: response.ok, body: await response.json() as DiscoverBody }
}

/**
 * The accounts this owner deployed that pass Leash verification.
 *
 * One implementation for /accounts and /setup (CLAUDE.md: two
 * implementations of one operation must not behave differently). It saves
 * nothing and never throws; the caller decides what to remember and what to
 * say. Explorer data only names candidates -- verifyPolicyAccount decides.
 */
export async function findOwnedAccounts(
  owner: `0x${string}`,
  signal: AbortSignal,
  deps: Deps = {},
): Promise<OwnedAccountsResult> {
  const fetchCandidates = deps.fetchCandidates ?? fetchDiscover
  const verify = deps.verify ?? verifyPolicyAccount
  let response: { ok: boolean; body: DiscoverBody }
  try {
    response = await fetchCandidates(owner, signal)
  } catch {
    return signal.aborted ? { status: 'aborted' } : { status: 'failed' }
  }
  // Replaced while the body was read. Nothing below is about this owner.
  if (signal.aborted) return { status: 'aborted' }
  const { ok, body } = response
  if (!ok || !Array.isArray(body.accounts)) {
    return { status: body.code === 'DISCOVERY_NOT_CONFIGURED' ? 'not-configured' : 'failed' }
  }

  const verified: DiscoveredAccountCandidate[] = []
  // Counted, not collapsed into a miss: a candidate the chain never answered
  // for has not been rejected, and no caller may imply it was.
  let unreadable = 0
  // Bounded concurrency: an active owner can have many unrelated deployments.
  for (let start = 0; start < body.accounts.length; start += 5) {
    const batch = body.accounts.slice(start, start + 5)
    const results = await Promise.all(batch.map(async (candidate) => ({
      candidate,
      result: await verify(candidate.address, owner),
    })))
    if (signal.aborted) return { status: 'aborted' }
    for (const { candidate, result } of results) {
      if (result === 'unreadable') unreadable++
      else if (result === 'verified') verified.push(candidate)
    }
  }
  return { status: 'ok', verified, unreadable, historyTruncated: Boolean(body.historyTruncated) }
}

/** Highest deploy block, compared as a number. */
export function newestAccount(
  list: readonly DiscoveredAccountCandidate[],
): DiscoveredAccountCandidate | null {
  let best: DiscoveredAccountCandidate | null = null
  for (const item of list) {
    if (!best || BigInt(item.deployBlock) > BigInt(best.deployBlock)) best = item
  }
  return best
}

export const LOOKUP_UNCERTAIN =
  'Could not confirm whether this wallet already owns a protected account. Check My accounts before creating another — a second account is a second deployment fee.'

/**
 * What /setup says after looking. Never "none" on a read that did not
 * happen: an uncertain answer says so, and still leaves Create enabled, since
 * a deployment without an explorer key must be able to create an account.
 */
export function accountLookupNote(result: OwnedAccountsResult): string | null {
  if (result.status === 'aborted') return null
  if (result.status !== 'ok') return LOOKUP_UNCERTAIN
  if (result.verified.length > 1) {
    return `This wallet owns ${result.verified.length} protected accounts. Resumed the newest; open My accounts to choose another.`
  }
  if (result.verified.length === 0 && (result.unreadable > 0 || result.historyTruncated)) return LOOKUP_UNCERTAIN
  return null
}
