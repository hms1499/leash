import { describe, it, expect } from 'vitest'
import {
  describeLog, rowKey, WINDOW_BLOCKS, WINDOW_LABEL, WINDOW_SECONDS,
} from '../lib/feed.js'

const TX = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const PAYEE = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'

describe('describeLog', () => {
  it('renders a spend with its payee', () => {
    const row = describeLog({
      eventName: 'Spent',
      args: { token: PAYEE, to: PAYEE, amount: 10_000n, operator: PAYEE },
      transactionHash: TX,
      blockNumber: 100n, logIndex: 0,
    })
    expect(row.kind).toBe('spent')
    expect(row.text).toBe('Spent to 0x2B33…4f57')
    expect(row.amount).toBe(10_000n)
  })

  it('exposes the operator that made the spend', () => {
    const row = describeLog({
      eventName: 'Spent',
      args: { token: PAYEE, to: PAYEE, amount: 10_000n, operator: PAYEE },
      transactionHash: TX,
      blockNumber: 100n, logIndex: 0,
    })
    expect(row.operator).toBe(PAYEE)
  })

  it('renders a top-up as money leaving the policy, not a payment', () => {
    const row = describeLog({
      eventName: 'ToppedUp',
      args: { token: PAYEE, operator: PAYEE, amount: 9_300n },
      transactionHash: TX,
      blockNumber: 101n, logIndex: 0,
    })
    expect(row.kind).toBe('toppedUp')
    expect(row.text).toBe('Topped up the agent wallet')
    expect(row.amount).toBe(9_300n)
  })

  it('renders a policy change with no amount column', () => {
    const row = describeLog({
      eventName: 'PolicyChanged',
      args: { token: PAYEE, perTx: 500_000n, daily: 1_000_000n },
      transactionHash: TX,
      blockNumber: 102n, logIndex: 0,
    })
    expect(row.kind).toBe('policy')
    expect(row.amount).toBeNull()
  })

  it('distinguishes pausing from resuming', () => {
    expect(describeLog({
      eventName: 'PausedSet', args: { paused: true },
      transactionHash: TX, blockNumber: 103n, logIndex: 0,
    }).kind).toBe('paused')

    expect(describeLog({
      eventName: 'PausedSet', args: { paused: false },
      transactionHash: TX, blockNumber: 104n, logIndex: 0,
    }).kind).toBe('unpaused')
  })
})

describe('rowKey', () => {
  // The backfill walks the window in chunks while a watcher streams new logs,
  // so the same log can arrive twice and two different logs can share a
  // transaction. Keying on the transaction alone would collapse an agent's
  // two spends in one transaction into a single row.
  it('separates two events emitted by one transaction', () => {
    const at = (logIndex: number) => rowKey(describeLog({
      eventName: 'Spent',
      args: { token: PAYEE, to: PAYEE, amount: 10_000n, operator: PAYEE },
      transactionHash: TX, blockNumber: 100n, logIndex,
    }))
    expect(at(0)).not.toBe(at(1))
  })

  it('gives the same log the same key however it arrived', () => {
    const row = () => describeLog({
      eventName: 'Spent',
      args: { token: PAYEE, to: PAYEE, amount: 10_000n, operator: PAYEE },
      transactionHash: TX, blockNumber: 100n, logIndex: 3,
    })
    expect(rowKey(row())).toBe(rowKey(row()))
  })
})

describe('the feed window', () => {
  // The defect this pins: the window was sized for "~5s blocks" and described
  // as three days, while Celo produces one block per second — so the feed
  // scanned 14.4 hours and told the reader it had scanned three days.
  // Measured against forno 2026-09-03: 10,000 blocks spanned 10,000 seconds.
  it('is described to the reader as the span it actually scans', () => {
    expect(Number(WINDOW_BLOCKS)).toBe(WINDOW_SECONDS)
    expect(WINDOW_SECONDS).toBe(24 * 60 * 60)
    expect(WINDOW_LABEL).toBe('24 hours')
  })
})
