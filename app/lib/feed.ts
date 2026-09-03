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
