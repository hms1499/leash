'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { spendPolicyAccountAbi } from '@leash/sdk'
import { publicClient } from './chain.js'

const OWNER_AND_PAUSED_ABI = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowlistEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'pendingOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'topUpEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
] as const

const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export type AccountState = {
  daily: bigint
  remaining: bigint
  perTx: bigint
  /**
   * What the account actually holds. The caps above are policy accounting and
   * never look at it, so without this the meter can read a full allowance on
   * an account holding nothing -- and every spend still reverts.
   */
  balance: bigint
  paused: boolean
  allowlistEnabled: boolean
  owner: `0x${string}` | null
  /**
   * The nominee of an outstanding two-step transfer, or the zero address when
   * there is none. Read rather than derived: the drawer's Accept button is
   * offered to this wallet and to no other, and a candidate from a query
   * parameter is not an answer.
   */
  pendingOwner: `0x${string}` | null
  /** Whether the agent may draw funds into its own wallet. Off at construction. */
  topUpEnabled: boolean
  isLoading: boolean
  error: Error | null
  /** Wall-clock time of the most recent complete, successful read. */
  updatedAt: number | null
  refetch: () => void
}

/**
 * The authoritative read. Polls every 4 seconds against Celo's ~1s blocks.
 *
 * `limits().spentToday` is deliberately discarded: it is stale after a UTC day
 * rolls over until the next spend. Callers derive spend from daily and
 * remaining instead.
 */
export function useAccountState(
  account: `0x${string}`,
  token: `0x${string}`,
): AccountState {
  const [state, setState] = useState<Omit<AccountState, 'refetch'>>({
    daily: 0n, remaining: 0n, perTx: 0n, balance: 0n, paused: false,
    allowlistEnabled: false, owner: null, pendingOwner: null, topUpEnabled: false,
    isLoading: true, error: null, updatedAt: null,
  })

  /**
   * True while a read is outstanding.
   *
   * The interval below fires every 4 seconds whether or not the previous read
   * came back. On a rate-limited endpoint a read spends seconds in viem's 429
   * backoff, so the ticks stack: six calls in flight become twelve, then
   * eighteen, each one making the rate limit that caused the delay worse. A
   * ref, not state, because skipping a tick must not re-render.
   *
   * A dropped tick is free; a dropped `refetch` is not. Every caller of
   * refetch has just watched a write confirm on chain, and the read it
   * collides with may have been issued BEFORE that write landed — so simply
   * returning would leave the meter showing the old number until the next
   * tick, four seconds of a figure the chain has already contradicted. Hence
   * `queued`: the outstanding read runs one more when it finishes.
   */
  const inFlight = useRef(false)
  const queued = useRef(false)

  const read = useCallback(async () => {
    if (inFlight.current) { queued.current = true; return }
    inFlight.current = true
    // Keep a previously observed snapshot visible during refreshes. On the
    // first read there is no snapshot, so the loading state remains explicit.
    // `error` is deliberately NOT cleared here. Clearing it optimistically
    // made the dashboard's "Could not refresh the account" banner appear and
    // vanish every four seconds during a sustained outage. It is cleared on a
    // successful read below, which is the only moment that is true.
    setState((s) => ({ ...s, isLoading: s.updatedAt === null }))
    try {
      const [
        limits, remaining, paused, allowlistEnabled, owner, pendingOwner, topUpEnabled, balance,
      ] = await Promise.all([
        publicClient.readContract({
          address: account, abi: spendPolicyAccountAbi,
          functionName: 'limits', args: [token],
        }),
        publicClient.readContract({
          address: account, abi: spendPolicyAccountAbi,
          functionName: 'remainingToday', args: [token],
        }),
        publicClient.readContract({
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'paused',
        }),
        publicClient.readContract({
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'allowlistEnabled',
        }),
        publicClient.readContract({
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'owner',
        }),
        // Elements of this array, never awaited after it. The array is what
        // lets viem multicall the whole read into one request; a sequential
        // read here would multiply requests on every four-second poll. The
        // `.catch` does not change when the request is issued, so the batch
        // survives it.
        //
        // Caught individually because these two are the only reads here that
        // a v1 account does not answer. SpendPolicyAccount is not upgradeable,
        // so v1 accounts exist for ever -- the project's own test account is
        // one -- and both functions revert on them. Inside a Promise.all that
        // took every figure on the dashboard down with it: balance, limits and
        // remaining allowance all read "—" on an account that was working
        // perfectly. Measured against 0xA73DB76f…F83982 on forno, 2026-09-12.
        //
        // The fallback can only ever hide an affordance, never offer one: no
        // nomination and no top-up. So a transient failure here costs the
        // nominee one four-second poll before Accept appears, and cannot show
        // anybody a control they may not use. The contract's own
        // NotPendingOwner is the boundary either way.
        publicClient.readContract({
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'pendingOwner',
        }).catch(() => null),
        publicClient.readContract({
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'topUpEnabled',
        }).catch(() => false),
        // Batched with the rest rather than introducing another sequential
        // round trip.
        publicClient.readContract({
          address: token, abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf', args: [account],
        }),
      ])
      const [perTx, daily] = limits as readonly [bigint, bigint, bigint, bigint]
      setState({
        perTx, daily, remaining: remaining as bigint,
        balance: balance as bigint,
        paused: paused as boolean, allowlistEnabled: allowlistEnabled as boolean,
        owner: owner as `0x${string}`,
        pendingOwner: pendingOwner as `0x${string}` | null,
        topUpEnabled: topUpEnabled as boolean,
        isLoading: false, error: null, updatedAt: Date.now(),
      })
    } catch (e) {
      setState((s) => ({ ...s, isLoading: false, error: e as Error }))
    } finally {
      inFlight.current = false
      if (queued.current) {
        queued.current = false
        void read()
      }
    }
  }, [account, token])

  useEffect(() => {
    void read()
    const t = setInterval(() => { if (!document.hidden) void read() }, 4000)
    return () => clearInterval(t)
  }, [read])

  return { ...state, refetch: read }
}
