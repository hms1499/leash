'use client'

import { useCallback, useEffect, useState } from 'react'
import { spendPolicyAccountAbi } from '@leash/sdk'
import { publicClient } from './chain.js'

const OWNER_AND_PAUSED_ABI = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
] as const

export type AccountState = {
  daily: bigint
  remaining: bigint
  perTx: bigint
  paused: boolean
  owner: `0x${string}` | null
  isLoading: boolean
  error: Error | null
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
    daily: 0n, remaining: 0n, perTx: 0n, paused: false, owner: null,
    isLoading: true, error: null,
  })

  const read = useCallback(async () => {
    try {
      const [limits, remaining, paused, owner] = await Promise.all([
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
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'owner',
        }),
      ])
      const [perTx, daily] = limits as readonly [bigint, bigint, bigint, bigint]
      setState({
        perTx, daily, remaining: remaining as bigint,
        paused: paused as boolean, owner: owner as `0x${string}`,
        isLoading: false, error: null,
      })
    } catch (e) {
      setState((s) => ({ ...s, isLoading: false, error: e as Error }))
    }
  }, [account, token])

  useEffect(() => {
    void read()
    const t = setInterval(() => { if (!document.hidden) void read() }, 4000)
    return () => clearInterval(t)
  }, [read])

  return { ...state, refetch: read }
}
