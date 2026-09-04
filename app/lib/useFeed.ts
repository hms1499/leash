'use client'

import { useEffect, useState } from 'react'
import { publicClient } from './chain.js'
import {
  describeLog, rowKey, tailRange, pickOperator, MAX_LOG_RANGE_BLOCKS, WINDOW_BLOCKS,
  type FeedRow, type OperatorChange,
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
  // Read, never rendered. The feed is the four events above (spec §1.3); this
  // one answers a different question -- who the account's operator is -- which
  // `operators` cannot be asked, being a mapping. Carried in the same getLogs
  // calls so discovery costs nothing extra. See pickOperator in feed.ts.
  { type: 'event', name: 'OperatorChanged', inputs: [
    { name: 'operator', type: 'address', indexed: true },
    { name: 'enabled', type: 'bool', indexed: false }] },
] as const

const CHUNK = MAX_LOG_RANGE_BLOCKS

// Enough to fill the panel. The window is walked newest-first, so stopping
// here means the reader already has more recent activity than they can see —
// not that anything was hidden.
const ENOUGH_ROWS = 25

type RawLog = {
  eventName: string
  args: Record<string, unknown>
  transactionHash: `0x${string}`
  blockNumber: bigint
  logIndex: number
}

/**
 * OperatorChanged goes to discovery, everything else to the feed. Keeping the
 * split in one place is what stops it becoming a row: `describeLog`'s default
 * branch would happily render it, and spec §1.3 fixes the feed at four events.
 */
function split(logs: readonly RawLog[]): { rows: FeedRow[]; changes: OperatorChange[] } {
  const feedRows: FeedRow[] = []
  const changes: OperatorChange[] = []
  for (const l of logs) {
    if (l.eventName === 'OperatorChanged') {
      changes.push({
        operator: l.args.operator as `0x${string}`,
        enabled: l.args.enabled as boolean,
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
      })
    } else {
      feedRows.push(describeLog(l))
    }
  }
  return { rows: feedRows, changes }
}

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
  const [operatorChanges, setOperatorChanges] = useState<OperatorChange[]>([])
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

          const { rows: chunkRows, changes } = split((logs ?? []).map((l) => ({
            eventName: l.eventName as string,
            args: l.args as Record<string, unknown>,
            transactionHash: l.transactionHash,
            blockNumber: l.blockNumber,
            logIndex: l.logIndex,
          })))
          if (changes.length > 0) setOperatorChanges((prev) => [...prev, ...changes])
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

    // The live tail, walked with getLogs rather than through
    // watchContractEvent. See tailRange in feed.ts for what the filter path
    // does on forno and why nothing ever arrived through it.
    //
    // EVENT_ABI, not spendPolicyAccountAbi: the SDK's ABI carries functions
    // and error definitions only — it has no `event` entries, so asking for
    // those would silently match nothing.
    let lastSeen: bigint | null = null

    async function tail() {
      // A hidden tab is not watching. The cursor stays put, and tailRange
      // clamps the catch-up when it comes back.
      if (cancelled || document.hidden) return
      try {
        const head = await publicClient.getBlockNumber()
        if (cancelled) return
        // Move the reference point every poll, not only when a log arrives:
        // it is what dates every row on screen, and a head that only advances
        // on activity leaves a quiet account's ages drifting.
        setHead((prev) => (prev && prev.block >= head ? prev : { block: head, seenAt: Date.now() }))

        if (lastSeen === null) { lastSeen = head; return }
        const range = tailRange(lastSeen, head)
        if (!range) return

        const logs = await publicClient.getLogs({
          address: account, events: EVENT_ABI,
          fromBlock: range.from, toBlock: range.to,
        })
        if (cancelled) return
        lastSeen = range.to
        if (logs.length === 0) return

        const { rows: tailRows, changes } = split(logs.map((l) => ({
          eventName: l.eventName as string,
          args: l.args as Record<string, unknown>,
          transactionHash: l.transactionHash,
          blockNumber: l.blockNumber,
          logIndex: l.logIndex,
        })))
        if (changes.length > 0) setOperatorChanges((prev) => [...prev, ...changes])
        if (tailRows.length > 0) setRows((prev) => merge(prev, tailRows))
      } catch {
        // One failed poll is not a failed feed: forno drops a call often
        // enough that surfacing it would mean an error banner on a working
        // page. The cursor is only advanced on success, so the next poll
        // asks for the same range again and nothing is skipped.
      }
    }

    const timer = setInterval(() => { void tail() }, 4000)

    return () => { cancelled = true; clearInterval(timer) }
  }, [account, fromBlock])

  return { rows, isLoading, error, head, operatorCandidate: pickOperator(operatorChanges) }
}
