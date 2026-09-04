/**
 * The palette as data so the contrast test can check it. Components read
 * `var(--bg)` from globals.css, never this module -- the CSS is the runtime
 * source and this is the assertion, and test/tokens.test.ts fails if the two
 * ever disagree.
 *
 * Ratios were measured on 2026-09-04. Two colours in the first draft failed
 * and changed: --bad from #C4544F (4.38 on the ground, and it carries body
 * text) and --meter-fill from #2C3540 (1.61 against its own track, which is
 * the whole information content of the meter). Spec §3.1.
 */
export const PALETTE = {
  bg: '#0B0D10',
  panel: '#14171C',
  well: '#07090B',
  text: '#E8EAED',
  dim: '#8A9199',
  celo: '#FCFF52',
  ok: '#4E9E7E',
  bad: '#D0605B',
  meterFill: '#5C6E88',
} as const

export type TokenName = keyof typeof PALETTE

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
