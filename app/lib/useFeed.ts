'use client'

import { useEffect, useState } from 'react'
import { publicClient } from './chain.js'
import {
  describeLog, rowKey, WINDOW_BLOCKS, type FeedRow,
} from './feed.js'

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

// forno refuses a wider getLogs range: 5,000 is served, 10,000 comes back
// "Invalid parameters were provided to the RPC method" (measured 2026-09-03).
const CHUNK = 5_000n

// Enough to fill the panel. The window is walked newest-first, so stopping
// here means the reader already has more recent activity than they can see —
// not that anything was hidden.
const ENOUGH_ROWS = 25

/** Newest first, and never the same log twice. */
function merge(existing: FeedRow[], incoming: FeedRow[]): FeedRow[] {
  const byKey = new Map(existing.map((r) => [rowKey(r), r]))
  for (const row of incoming) byKey.set(rowKey(row), row)
  return [...byKey.values()].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(b.blockNumber - a.blockNumber)
    return b.logIndex - a.logIndex
  })
}

export function useFeed(account: `0x${string}`, fromBlock?: bigint) {
  const [rows, setRows] = useState<FeedRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // The last block height this hook actually observed, and the wall-clock
  // moment it did. Together they date every row without a single further RPC
  // call: Celo blocks are one second apart (measured, see feed.ts), so a row's
  // age is (head - its block) seconds, plus however long ago that head was
  // read. Asking the chain for each row's timestamp would be one getBlock per
  // row for the same answer.
  const [head, setHead] = useState<{ block: bigint; seenAt: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    // Walked newest-first and published chunk by chunk. A whole-window scan
    // is 18 sequential round trips; painting only at the end would leave the
    // most recent spend — the one a demo is about — waiting on the oldest
    // chunk nobody is looking at.
    async function backfill() {
      try {
        const head = await publicClient.getBlockNumber()
        if (!cancelled) setHead({ block: head, seenAt: Date.now() })
        // A caller-supplied floor can only NARROW the walk. An account
        // deployed an hour ago has no logs before its deploy block, so
        // scanning there is wasted round trips; an account deployed last week
        // must still not cost 52 of them.
        const windowFloor = head > WINDOW_BLOCKS ? head - WINDOW_BLOCKS : 0n
        const floor = fromBlock !== undefined && fromBlock > windowFloor
          ? fromBlock
          : windowFloor
        let to = head
        let collected = 0

        while (to >= floor && !cancelled) {
          const span = to - floor + 1n
          const from = span > CHUNK ? to - CHUNK + 1n : floor

          let logs
          // One retry: forno is load-balanced and a single node may refuse a
          // range the next one serves.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              logs = await publicClient.getLogs({
                address: account, events: EVENT_ABI, fromBlock: from, toBlock: to,
              })
              break
            } catch (e) {
              if (attempt === 1) throw e
            }
          }
          if (cancelled) return

          const chunkRows = (logs ?? []).map((l) => describeLog({
            eventName: l.eventName as string,
            args: l.args as Record<string, unknown>,
            transactionHash: l.transactionHash,
            blockNumber: l.blockNumber,
            logIndex: l.logIndex,
          }))
          collected += chunkRows.length
          // Merged, never assigned: the live watcher below is already running
          // and its rows must survive a backfill chunk landing after them.
          //
          // Loading only ends when there is something to show or the whole
          // window has been walked. Ending it after an empty first chunk
          // would render "Nothing has been spent in the last 24 hours" while
          // 17 chunks of that window were still unread.
          if (chunkRows.length > 0) {
            setRows((prev) => merge(prev, chunkRows))
            setLoading(false)
          }

          if (collected >= ENOUGH_ROWS || from === floor) break
          to = from - 1n
        }

        if (!cancelled) setLoading(false)
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
        // A watched log is proof the chain has reached at least its block, so
        // the reference point moves forward for free.
        for (const l of logs) {
          const b = l.blockNumber as bigint | null
          if (b !== null) {
            setHead((prev) => (prev && prev.block >= b ? prev : { block: b, seenAt: Date.now() }))
          }
        }
        setRows((prev) => merge(prev, logs.map((l) => describeLog({
          eventName: (l as { eventName: string }).eventName,
          args: (l as { args: Record<string, unknown> }).args,
          transactionHash: l.transactionHash as `0x${string}`,
          blockNumber: l.blockNumber as bigint,
          logIndex: l.logIndex as number,
        }))))
      },
    })

    return () => { cancelled = true; unwatch() }
  }, [account, fromBlock])

  return { rows, isLoading, error, head }
}
