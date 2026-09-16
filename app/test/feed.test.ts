import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  arrivedKeys, belongsToToken, describeLog, rowKey, relativeAge, WINDOW_BLOCKS, WINDOW_LABEL, WINDOW_SECONDS,
  type FeedRow,
  tailRange, MAX_LOG_RANGE_BLOCKS, liveOperators,
} from '../lib/feed.js'

const TX = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const PAYEE = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'

describe('belongsToToken', () => {
  const usdc = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'

  it('keeps token-scoped events only for the dashboard token', () => {
    expect(belongsToToken('Spent', { token: usdc.toLowerCase() }, usdc)).toBe(true)
    expect(belongsToToken('Spent', { token: PAYEE }, usdc)).toBe(false)
  })

  it('keeps account-wide events', () => {
    expect(belongsToToken('PausedSet', { paused: true }, usdc)).toBe(true)
    expect(belongsToToken('OperatorChanged', { operator: PAYEE }, usdc)).toBe(true)
  })

  // None of the three v2 events carries a `token` field, so the token check
  // would drop them silently — the same shape of bug as a busy account whose
  // feed read as quiet.
  it('keeps the ownership and switch events, which carry no token', () => {
    expect(belongsToToken('OwnershipTransferStarted', {}, usdc)).toBe(true)
    expect(belongsToToken('OwnershipTransferred', {}, usdc)).toBe(true)
    expect(belongsToToken('TopUpEnabledSet', { enabled: true }, usdc)).toBe(true)
  })
})

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

  const OWNER_A = '0x1111111111111111111111111111111111111111'
  const OWNER_B = '0x2222222222222222222222222222222222222222'

  // A nomination is not a handover. The two-step exists precisely so a wrong
  // address can be caught before it holds anything, and a feed that read them
  // the same way would tell the owner the mistake had already landed.
  it('describes a nomination as pending, not as a handover', () => {
    const row = describeLog({
      eventName: 'OwnershipTransferStarted',
      args: { from: OWNER_A, to: OWNER_B },
      transactionHash: TX, blockNumber: 1n, logIndex: 0,
    })
    expect(row.kind).toBe('ownership')
    expect(row.text).toMatch(/pending|proposed|nominated/i)
    expect(row.amount).toBeNull()
  })

  it('describes a completed handover with the address that now owns it', () => {
    const row = describeLog({
      eventName: 'OwnershipTransferred',
      args: { from: OWNER_A, to: OWNER_B },
      transactionHash: TX, blockNumber: 1n, logIndex: 0,
    })
    expect(row.kind).toBe('ownership')
    expect(row.text).toContain('0x2222')
    expect(row.text).not.toMatch(/pending|proposed|nominated/i)
    expect(row.amount).toBeNull()
  })

  it('says which way the top-up switch moved', () => {
    const on = describeLog({
      eventName: 'TopUpEnabledSet', args: { enabled: true },
      transactionHash: TX, blockNumber: 1n, logIndex: 0,
    })
    const off = describeLog({
      eventName: 'TopUpEnabledSet', args: { enabled: false },
      transactionHash: TX, blockNumber: 1n, logIndex: 1,
    })
    expect(on.kind).toBe('topUpSwitch')
    expect(off.kind).toBe('topUpSwitch')
    expect(on.text).not.toBe(off.text)
    expect(on.amount).toBeNull()
    expect(off.amount).toBeNull()
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

describe('relativeAge', () => {
  // A judge cannot tell a 10-second-old spend from a 10-hour-old one without
  // this, and the demo turns on watching a row appear.
  it('reads in seconds for something that just happened', () => {
    expect(relativeAge(12)).toBe('12s ago')
  })

  it('reads in minutes, then hours, then days', () => {
    expect(relativeAge(5 * 60)).toBe('5m ago')
    expect(relativeAge(3 * 3600)).toBe('3h ago')
    expect(relativeAge(2 * 86_400)).toBe('2d ago')
  })

  it('rounds down, so nothing is ever reported as older than it is', () => {
    expect(relativeAge(119)).toBe('1m ago')
    expect(relativeAge(59)).toBe('59s ago')
  })

  // The age is derived from a block delta plus elapsed wall time, and a
  // freshly mined block can read a second or two ahead of the last observed
  // head. A negative age must not render as "-2s ago".
  it('never renders a negative age', () => {
    expect(relativeAge(-2)).toBe('just now')
    expect(relativeAge(0)).toBe('just now')
  })
})

describe('tailRange', () => {
  it('asks for everything after the last block already seen', () => {
    expect(tailRange(100n, 104n)).toEqual({ from: 101n, to: 104n })
  })

  it('returns null when the chain has not moved', () => {
    expect(tailRange(100n, 100n)).toBeNull()
  })

  it('returns null when the node answers with an older head', () => {
    // forno is load-balanced: a later call can land on a node that is behind.
    // Walking backwards would re-ask for logs already merged, and setting the
    // cursor back would re-ask for them again on every poll after that.
    expect(tailRange(100n, 97n)).toBeNull()
  })

  it('never asks for a range forno refuses', () => {
    const r = tailRange(0n, 20_000n)!
    expect(r.to - r.from + 1n).toBeLessThanOrEqual(MAX_LOG_RANGE_BLOCKS)
    expect(r.to).toBe(20_000n)
  })

  it('keeps the newest blocks when it has to drop some', () => {
    // A tab left hidden for two hours comes back 7,200 blocks behind. The
    // recent end is the half a reader is looking at; the backfill owns
    // history.
    const r = tailRange(0n, 7_200n)!
    expect(r.to).toBe(7_200n)
    expect(r.from).toBe(7_200n - MAX_LOG_RANGE_BLOCKS + 1n)
  })
})

describe('liveOperators', () => {
  const at = (operator: string, enabled: boolean, blockNumber: bigint, logIndex = 0) =>
    ({ operator: operator as `0x${string}`, enabled, blockNumber, logIndex })

  const A = '0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6'
  const B = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'

  it('has nothing to offer from an empty history', () => {
    expect(liveOperators([])).toEqual([])
  })

  it('offers the operator the owner authorised', () => {
    expect(liveOperators([at(A, true, 100n)])).toEqual([A])
  })

  it('does not offer one the owner has since revoked', () => {
    expect(liveOperators([at(A, true, 100n), at(A, false, 200n)])).toEqual([])
  })

  it('offers one re-authorised after a revocation', () => {
    expect(liveOperators([at(A, true, 100n), at(A, false, 200n), at(A, true, 300n)])).toEqual([A])
  })

  it('reads the events in chain order, not the order they arrived', () => {
    // The backfill walks newest-first and merges with the live tail, so this
    // function is handed logs out of order as a matter of course.
    expect(liveOperators([at(A, false, 200n), at(A, true, 100n)])).toEqual([])
  })

  it('separates two writes in one block by log index', () => {
    expect(liveOperators([at(A, true, 100n, 1), at(A, false, 100n, 0)])).toEqual([A])
  })

  /**
   * The defect this function was widened for. It used to return only the
   * newest live operator, so an account with two authorised keys showed one --
   * and an owner who revoked that one read "no operator" while the other still
   * spent to the daily cap.
   */
  it('returns EVERY live operator, not just the newest', () => {
    expect(liveOperators([at(A, true, 100n), at(B, true, 300n)])).toEqual([B, A])
  })

  it('orders them newest authorisation first', () => {
    expect(liveOperators([at(A, true, 300n), at(B, true, 100n)])).toEqual([A, B])
  })

  it('drops only the revoked one when several are live', () => {
    expect(liveOperators([at(A, true, 100n), at(B, true, 200n), at(B, false, 300n)])).toEqual([A])
  })

  it('counts a re-authorisation as the newest, not the original grant', () => {
    // A was granted first but re-granted last, so it is the more recent
    // authorisation and should lead.
    expect(liveOperators([at(A, true, 100n), at(B, true, 200n), at(A, false, 300n), at(A, true, 400n)]))
      .toEqual([A, B])
  })

  it('never returns the same address twice', () => {
    const out = liveOperators([at(A, true, 100n), at(A, true, 200n), at(A, true, 300n)])
    expect(out).toEqual([A])
  })
})

/**
 * design-system.md §12, widened 2026-09-14 from "nothing moves that the reader
 * did not cause" to "…the reader or the chain". This is the only thing the
 * widening admits, so these assert the two halves of it: an arrival moves, and
 * a first render does not.
 */
describe('arrivedKeys', () => {
  const row = (txHash: string, logIndex = 0): FeedRow => ({
    kind: 'spent', text: 'paid', amount: 1n,
    txHash: txHash as `0x${string}`, blockNumber: 1n, logIndex,
  })

  /**
   * The load-bearing half. §12: "A transition does not run on first render."
   * Without this the whole feed would announce itself every time the panel
   * mounted, which is an entrance -- the exact thing the rule refuses.
   */
  it('reports nothing before it has seen a poll', () => {
    expect([...arrivedKeys(new Set(), false, [row('0xa'), row('0xb')])]).toEqual([])
  })

  it('reports a row whose transaction was not in the previous poll', () => {
    const seen = new Set([rowKey(row('0xa'))])
    expect([...arrivedKeys(seen, true, [row('0xb'), row('0xa')])])
      .toEqual([rowKey(row('0xb'))])
  })

  it('reports nothing when the poll returned what it returned last time', () => {
    const rows = [row('0xa'), row('0xb')]
    const seen = new Set(rows.map(rowKey))
    expect([...arrivedKeys(seen, true, rows)]).toEqual([])
  })

  /**
   * Two logs in one transaction are two rows. Keying on the hash alone would
   * silence the second, which is the case rowKey's own tests exist for.
   */
  it('tells two logs of one transaction apart', () => {
    const seen = new Set([rowKey(row('0xa', 0))])
    expect([...arrivedKeys(seen, true, [row('0xa', 1), row('0xa', 0)])])
      .toEqual([rowKey(row('0xa', 1))])
  })
})

/**
 * The two renderings of one feed, asserted against each other.
 *
 * CLAUDE.md: "Two implementations of one operation must not behave
 * differently; if you fix an error path in one, fix its sibling." The arrival
 * reveal was added to `Feed` when design-system.md §12 was widened on
 * 2026-09-14 and not to `LiveProof`, so the dashboard announced a payment
 * landing and the landing page -- the panel a stranger sees without a wallet,
 * where "the money is real" is the entire argument -- did not.
 *
 * Source-reading rather than rendering, the same way surface.test.ts and
 * scaleUsage.test.ts work: the node environment has no DOM, and what must not
 * drift is that both files reach for the same mechanism.
 */
describe('the feed renders the same way in both places', () => {
  const read = (f: string) => readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), f), 'utf8')

  it.each([
    ['components/Feed.tsx'],
    ['components/landing/LiveProof.tsx'],
  ])('%s announces an arrival with the declared vocabulary', (file) => {
    const src = read(file)
    // The shared pure function, not a second copy of the rule.
    expect(src, `${file} does not use arrivedKeys`).toContain('arrivedKeys')
    // §12's one sanctioned class, at --m-fast. A hand-rolled duration here
    // would also fail surface.test.ts, which is the belt to this file's braces.
    expect(src, `${file} does not apply motion-reveal`).toContain('motion-reveal')
    // §12: "a transition does not run on first render." Without `primed` every
    // row announces itself on mount, which is an entrance.
    expect(src, `${file} does not prime, so every row would announce on mount`)
      .toContain('primed')
  })
})
