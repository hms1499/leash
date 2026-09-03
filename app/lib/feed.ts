import { truncateAddress } from './address.js'

export type FeedRow = {
  kind: 'spent' | 'toppedUp' | 'policy' | 'paused' | 'unpaused'
  text: string
  amount: bigint | null
  txHash: `0x${string}`
  blockNumber: bigint
  operator?: `0x${string}`
}

type DecodedLog = {
  eventName: string
  args: Record<string, unknown>
  transactionHash: `0x${string}`
  blockNumber: bigint
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
  const base = { txHash: log.transactionHash, blockNumber: log.blockNumber }

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
