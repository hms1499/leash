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
 *
 * ## The grounds were lifted off black on 2026-09-11
 *
 * §4 had measured its three dark grounds against each other and found them
 * 1.03 to 1.11 apart, and concluded a surface could never be told from the
 * page behind it. The ratio was right and the unit was wrong: a contrast
 * ratio is built for a glyph against its background, and between two dark
 * neighbours it compresses to nothing. In L* -- perceptual lightness, which
 * is what an eye uses on two adjacent fills -- `--panel` stood **4.1** above
 * `--bg` and `--well` **1.2** below it.
 *
 * The grounds now sit at **8.2** and **2.8**, which is the smallest step that
 * reads as a separate surface rather than as a rendering artefact. Two
 * foregrounds had to move with them, and that is the whole cost: `--bad` on
 * the lighter panel fell to 3.99 and `--line-control` to 2.77, both under
 * their bars. Lifting each clears it with headroom (5.17 and 3.97) and the
 * bright-ground rule improves as a side effect -- `--bg` on `--bad` goes from
 * 4.79 to 6.21.
 */
export const PALETTE = {
  bg: '#12151B',
  panel: '#20262F',
  well: '#0B0E12',
  text: '#E8EAED',
  dim: '#959CA5',
  celo: '#FCFF52',
  ok: '#4E9E7E',
  bad: '#DE7A72',
  meterFill: '#5C6E88',
  /**
   * Control borders. --line is rgba(255,255,255,.10), which is 1.32:1 on
   * --panel: correct for a divider, and nothing at all for the border of a
   * button. Measured 2026-09-05: this clears 3:1 on all three dark grounds
   * (3.27 panel, 3.55 bg, 3.64 well) with a little headroom.
   */
  lineControl: '#7B838E',
  /**
   * The primary button while the pointer is on it. §4's grounds are all within
   * 1.11 of each other -- `--panel` on `--bg` is 1.08, `--well` on `--bg` is
   * 1.03 -- so a hover that fills a control with the next ground along fills
   * it with nothing a reader can see. A bordered control can move its line
   * instead; a solid one has only its own ground, so this is that ground one
   * step down. Measured 2026-09-11: 14.90 against `--bg`, which is what the
   * primary button's label is, so §4's bright-ground rule still holds with
   * room to spare (`--celo` itself is 18.13).
   */
  celoHover: '#E6E93C',
} as const

export type TokenName = keyof typeof PALETTE

/**
 * A ground is a colour something is drawn *on*. The app has five, and until
 * 2026-09-05 only two were ever checked -- which is how a warning came to be
 * painted in the colour behind it. docs/design-system.md §4.
 *
 * The split is not stylistic. On the dark grounds every foreground except
 * --bg clears AA; on the bright ones only --bg does.
 */
export const DARK_GROUNDS = ['bg', 'panel', 'well'] as const satisfies readonly TokenName[]
export const BRIGHT_GROUNDS = ['bad', 'celo'] as const satisfies readonly TokenName[]

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

/**
 * CIE L*, the perceptual lightness of a colour on a 0-100 scale.
 *
 * `contrastRatio` is the right tool for a foreground on a ground and the wrong
 * one for two adjacent fills: it is a ratio of luminances plus a constant, so
 * between two dark neighbours it lands near 1.00 whatever the eye can see.
 * That is how §4 came to record its grounds as 1.03-1.11 apart and conclude a
 * surface could not be distinguished, when the real distance was 4.1 points of
 * lightness -- small, but not nothing.
 */
export function lightness(hex: string): number {
  const y = relativeLuminance(hex)
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
