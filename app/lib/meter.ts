import { percentUsed, refusalThreshold } from './policy.js'

export type MeterInput = {
  daily: bigint
  remaining: bigint
  paused: boolean
  loading: boolean
  visible: boolean
  reduced: boolean
}

export type MeterState = {
  fillPercent: number
  locked: boolean
  animating: boolean
}

/**
 * Every decision the meter makes, as data. Extracted from the component so it
 * can be tested at all: app/vitest.config.ts runs in the node environment and
 * no component-testing dependency may be added (spec §2.2).
 *
 * `loading` suppresses everything. Before the first read returns there is
 * nothing to state, and a full bar or a lock icon drawn from a zero that is
 * merely un-read is a lie about someone's money.
 */
export function meterState(
  { daily, remaining, paused, loading, visible, reduced }: MeterInput,
): MeterState {
  if (loading) return { fillPercent: 0, locked: false, animating: false }

  const locked = daily > 0n && remaining === 0n
  const animating = !paused && !locked && visible && !reduced

  return { fillPercent: percentUsed(daily, remaining), locked, animating }
}

/**
 * What the band under the meter says, as data.
 *
 * The band used to be a chain of conditionals inside Meter.tsx, which this
 * project cannot test: vitest runs in the node environment and no
 * component-testing dependency may be added (spec §2.2). It is here for the
 * same reason meterState is.
 *
 * The balance belongs in this decision and was missing from it. The meter is
 * drawn from `remainingToday` and `limits`, which are policy accounting and
 * never look at the money: an account holding nothing reads as a full
 * allowance while every spend reverts, because `execute` consumes the cap and
 * only then calls `transfer`. Measured on 0xA73DB76f on 2026-09-04 --
 * remainingToday 1.000000 against a balance of 0.
 *
 * That failure is also one of the three cases in spec §1.3 where a revert
 * actually lands, and the feed cannot show a landed revert (§4, struck
 * 2026-09-04). So the only place a reader can learn it is here, before the
 * money moves -- which is what §1.3 asks the meter to do anyway.
 */
export type SpendBand =
  | { kind: 'loading' }
  | { kind: 'paused' }
  | { kind: 'unfunded' }
  | { kind: 'exhausted' }
  | { kind: 'ceiling'; amount: bigint }

export function spendBand({
  remaining, perTx, balance, paused, loading,
}: {
  remaining: bigint; perTx: bigint; balance: bigint
  paused: boolean; loading: boolean
}): SpendBand {
  if (loading) return { kind: 'loading' }
  // The owner's own doing, and reversible in one click. It outranks whatever
  // else is true, because it is the one the owner can act on immediately.
  if (paused) return { kind: 'paused' }
  // Ahead of the spent allowance on purpose: an allowance resets at UTC
  // midnight and an empty account does not, so this is the statement that is
  // still true tomorrow.
  if (balance === 0n) return { kind: 'unfunded' }

  const cap = refusalThreshold(remaining, perTx)
  if (cap === 0n) return { kind: 'exhausted' }

  return { kind: 'ceiling', amount: cap < balance ? cap : balance }
}
