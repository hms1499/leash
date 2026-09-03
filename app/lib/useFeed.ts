'use client'

import { useEffect, useState } from 'react'
import { publicClient } from './chain.js'
import { describeLog, type FeedRow } from './feed.js'

const EVENT_ABI = [
  { type: 'event', name: 'Spent', inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'operator', type: 'address', indexed: true }] },
  { type: 'event', name: 'ToppedUp', inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'operator', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'PolicyChanged', inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'perTx', type: 'uint256', indexed: false },
    { name: 'daily', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'PausedSet', inputs: [
    { name: 'paused', type: 'bool', indexed: false }] },
] as const

// Celo blocks are ~5s, so three days is roughly this many. forno will not
// serve that range in one call, hence the chunking below.
const WINDOW_BLOCKS = 51_840n
const CHUNK = 5_000n

export function useFeed(account: `0x${string}`, fromBlock?: bigint) {
  const [rows, setRows] = useState<FeedRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    async function backfill() {
      try {
        const head = await publicClient.getBlockNumber()
        const start = fromBlock ?? (head > WINDOW_BLOCKS ? head - WINDOW_BLOCKS : 0n)
        const collected: FeedRow[] = []

        for (let from = start; from <= head; from += CHUNK) {
          const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n
          // One retry: forno is load-balanced and a single node may refuse a
          // range the next one serves.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const logs = await publicClient.getLogs({
                address: account, events: EVENT_ABI, fromBlock: from, toBlock: to,
              })
              for (const l of logs) {
                collected.push(describeLog({
                  eventName: l.eventName as string,
                  args: l.args as Record<string, unknown>,
                  transactionHash: l.transactionHash,
                  blockNumber: l.blockNumber,
                }))
              }
              break
            } catch (e) {
              if (attempt === 1) throw e
            }
          }
        }

        if (!cancelled) {
          collected.sort((a, b) => Number(b.blockNumber - a.blockNumber))
          setRows(collected)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) { setError(e as Error); setLoading(false) }
      }
    }

    void backfill()

    // EVENT_ABI, not spendPolicyAccountAbi: the SDK's ABI carries functions
    // and error definitions only — it has no `event` entries, so watching
    // with it would silently never fire.
    const unwatch = publicClient.watchContractEvent({
      address: account, abi: EVENT_ABI, poll: true, pollingInterval: 4000,
      onLogs: (logs) => {
        setRows((prev) => [
          ...logs.map((l) => describeLog({
            eventName: (l as { eventName: string }).eventName,
            args: (l as { args: Record<string, unknown> }).args,
            transactionHash: l.transactionHash as `0x${string}`,
            blockNumber: l.blockNumber as bigint,
          })),
          ...prev,
        ])
      },
    })

    return () => { cancelled = true; unwatch() }
  }, [account, fromBlock])

  return { rows, isLoading, error }
}
