import { truncateAddress } from './address.js'

export type FeedRow = {
  kind: 'spent' | 'toppedUp' | 'policy' | 'paused' | 'unpaused'
  text: string
  amount: bigint | null
  txHash: `0x${string}`
  blockNumber: bigint
  logIndex: number
  operator?: `0x${string}`
}

type DecodedLog = {
  eventName: string
  args: Record<string, unknown>
  transactionHash: `0x${string}`
  blockNumber: bigint
  logIndex: number
}

/**
 * How far back the feed looks.
 *
 * Celo produces one block per second — measured against forno on 2026-09-03,
 * where 10,000 blocks spanned exactly 10,000 seconds. An earlier constant was
 * sized for "~5s blocks", so the feed scanned 14.4 hours while telling the
 * reader it had covered three days: a claim about a range it never queried.
 * The label lives beside the number so the two cannot drift apart again.
 *
 * A wider window is not free. forno refuses any getLogs range above 5,000
 * blocks (10,000 fails outright), so every extra day costs 17 more sequential
 * round trips on each page load.
 */
export const WINDOW_SECONDS = 24 * 60 * 60
export const WINDOW_BLOCKS = BigInt(WINDOW_SECONDS)
export const WINDOW_LABEL = '24 hours'

/**
 * The widest range forno will serve in one `getLogs` call. Measured against
 * forno on 2026-09-03: 5,000 is served, 10,000 comes back "Invalid parameters
 * were provided to the RPC method". Both the history walk and the live tail
 * are bound by it, so it is stated once.
 */
export const MAX_LOG_RANGE_BLOCKS = 5_000n

/**
 * The next range the live tail should ask for, or null if it should not ask.
 *
 * The tail exists because `watchContractEvent` cannot be trusted here.
 * Measured 2026-09-04: forno accepts `eth_newFilter` and returns an id, so
 * viem takes the filter path and never falls back to `getLogs`; every
 * `eth_getFilterChanges` after that lands on a different node behind the load
 * balancer and answers "filter not found" (`-32602`, five times in six). viem
 * only rebuilds a filter on `InvalidInputRpcError`, which `-32602` is not, and
 * this hook passed no `onError` -- so the live feed silently never updated and
 * only a reload showed anything new.
 *
 * Returns null when the head has not moved, and also when it has gone
 * backwards: forno can answer from a node that is behind, and moving the
 * cursor back would re-ask for the same logs on every poll thereafter.
 */
export function tailRange(
  lastSeen: bigint, head: bigint, max: bigint = MAX_LOG_RANGE_BLOCKS,
): { from: bigint; to: bigint } | null {
  if (head <= lastSeen) return null
  const span = head - lastSeen
  // A tab left hidden comes back a long way behind. Keep the newest `max`
  // blocks rather than asking for a range forno will refuse outright: the
  // recent end is what a reader is looking at, and history is the backfill's
  // job.
  const from = span > max ? head - max + 1n : lastSeen + 1n
  return { from, to: head }
}

/**
 * How long ago, in words.
 *
 * Spec §4 asks for a relative time on every feed row and none carried one, so
 * a reader could not tell a spend from ten seconds ago from one from ten
 * hours ago — which is most of what a live demo is showing.
 *
 * Rounds down: nothing is ever reported as older than it is. A block mined
 * after the last observed head produces a negative age, which reads as "just
 * now" rather than "-2s ago".
 */
export function relativeAge(seconds: number): string {
  if (seconds <= 0) return 'just now'
  if (seconds < 60) return `${Math.floor(seconds)}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

/**
 * Identity of one log. A transaction hash alone is not one: a single
 * transaction can emit several events, and the backfill and the live watcher
 * can both deliver the same log.
 */
export function rowKey(row: FeedRow): string {
  return `${row.txHash}-${row.logIndex}`
}

/**
 * Turns one decoded event into a display row.
 *
 * Only on-chain events appear here. A spend the policy refused never became a
 * transaction — the MCP server pre-checks with a staticcall — so the feed has
 * no blocked rows to show and must not pretend otherwise. The wall is stated
 * by the meter instead, before money moves.
 */
export function describeLog(log: DecodedLog): FeedRow {
  const base = {
    txHash: log.transactionHash, blockNumber: log.blockNumber,
    logIndex: log.logIndex,
  }

  switch (log.eventName) {
    case 'Spent':
      return {
        ...base, kind: 'spent',
        text: `Spent to ${truncateAddress(String(log.args.to))}`,
        amount: log.args.amount as bigint,
        operator: log.args.operator as `0x${string}`,
      }
    case 'ToppedUp':
      return {
        ...base, kind: 'toppedUp',
        text: 'Topped up the agent wallet',
        amount: log.args.amount as bigint,
        operator: log.args.operator as `0x${string}`,
      }
    case 'PolicyChanged':
      return { ...base, kind: 'policy', text: 'Limits changed', amount: null }
    case 'PausedSet':
      return log.args.paused === true
        ? { ...base, kind: 'paused', text: 'Paused by the owner', amount: null }
        : { ...base, kind: 'unpaused', text: 'Resumed by the owner', amount: null }
    default:
      return { ...base, kind: 'policy', text: log.eventName, amount: null }
  }
}
