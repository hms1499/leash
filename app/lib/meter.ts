import { percentUsed } from './policy.js'

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
