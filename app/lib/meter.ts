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
  | {
      kind: 'ceiling'
      amount: bigint
      /**
       * Which of the three bounds produced `amount`. The figure alone does
       * not tell an owner whether to raise a cap or send more money, and
       * those are opposite actions.
       */
      limitedBy: 'daily allowance' | 'per-transaction cap' | 'balance'
      /**
       * Whether the payee allowlist is on. The ceiling is still the right
       * figure when it is -- a payment to an APPROVED address really can be
       * this large -- but the figure alone reads as "anyone, up to here", and
       * the contract refuses every payee that is not on the list. It cannot be
       * asked how many are: payeeAllowlist is a mapping and is not enumerable.
       */
      restrictedToApprovedPayees: boolean
    }

export function spendBand({
  remaining, perTx, balance, allowlistEnabled, paused, loading,
}: {
  remaining: bigint; perTx: bigint; balance: bigint; allowlistEnabled: boolean
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

  if (balance < cap) {
    return {
      kind: 'ceiling', amount: balance, limitedBy: 'balance',
      restrictedToApprovedPayees: allowlistEnabled,
    }
  }
  // A tie between the two policy bounds resolves toward the per-transaction
  // cap, deterministically, so the sentence under the figure does not flicker
  // between renders.
  return {
    kind: 'ceiling',
    amount: cap,
    limitedBy: remaining < perTx ? 'daily allowance' : 'per-transaction cap',
    restrictedToApprovedPayees: allowlistEnabled,
  }
}

/**
 * What a band says. The four §5 state-vocabulary strings, and only those.
 *
 * They lived in Meter.tsx as a nested ternary, which was fine while the only
 * reader was a pair of eyes. They are here so a test can hold them to the
 * word: the point of a state vocabulary is that it is not reworded, and
 * nothing asserted that until now.
 *
 * `ceiling` is deliberately not a case. Its figure and its clause are two
 * elements in the layout and announcing them meant either duplicating the
 * page's dominant number into a second hidden copy -- which reads twice to
 * anyone browsing, and broke three e2e locators by existing -- or composing a
 * sentence that could drift from the one on screen. The block announces
 * itself instead, through aria-atomic on the markup that is already there.
 */
export function bandSentence(
  band: Exclude<SpendBand, { kind: 'ceiling' }>,
  symbol: string,
): string {
  switch (band.kind) {
    case 'loading':
      return 'Reading the chain…'
    case 'paused':
      return 'Paused by the owner — every spend is refused'
    case 'unfunded':
      return `This account holds no ${symbol} — every spend will fail`
    case 'exhausted':
      return 'The allowance is spent — resets at UTC midnight'
  }
}

/**
 * The figure the dashboard renders at --t-display, for every band.
 *
 * §7 names the refusal threshold as the dashboard's dominant element, and it
 * was rendered for `ceiling` alone. In the other four bands the screen had no
 * dominant element at all: the largest thing on it was the status headline
 * and the meter said its piece at 11px uppercase. The hierarchy inverted
 * exactly when something was wrong -- the same shape of defect as the §4
 * badge drawn in the colour behind it, at the one moment an owner most needs
 * to read it.
 *
 * The threshold in those bands is not unknown, it is zero, so it is stated.
 *
 * `loading` is the exception, and the reason this returns a nullable rather
 * than a bigint: zeroes are not observations (§5), and a 0.00 drawn while the
 * first read is in flight is a claim about the chain that nobody has made.
 */
export function bandFigure(band: SpendBand): bigint | null {
  if (band.kind === 'loading') return null
  if (band.kind === 'ceiling') return band.amount
  return 0n
}
